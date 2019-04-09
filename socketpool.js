/*
  node socket clien pool
  reference：https://github.com/hnry/socket-pool
  不适用于短连接
*/


var Socket = require('net').Socket;


/*  Pool class
  servers = [{host:'127.0.0.1', port:80, weight:0.5}, {host:'10.49.99.161', port:5792, weight:0.5}]
  opts    = {min:2, max:5}
*/
function Pool(servers, opts) {
  if(!servers || !servers.length){
    throw new Error('error servers');
    return;
  }

  this.servers = {};                        //存储用户传过来的servers
  this._sockets = {};                       //总仓库，存储所有connect的socket，格式如：this._sockets[tag][pid] = socket;

  this.min = (opts && opts.min) || 5;       //这个是可用队列 available 的最小值
  this.max = (opts && opts.max) || 10;      //这个是总池子 _sockets 的最大容量
  this.maxQueueLen = 0;                     //0表示不限。超长时，会导致调用adToQueue失败。
  if(opts && opts.maxQueueLen>0){
    this.maxQueueLen = opts.maxQueueLen;
    if(this.maxQueueLen>100000){
      this.maxQueueLen=100000;
    }
  }
  this.debug = (opts && opts.debug) || 0;   //是否显示调试日志


  for (var i = 0, l = servers.length; i < l; i++) {
    let tag = servers[i].host + ':' + servers[i].port;
    this.servers[tag]   = servers[i];
    this._sockets[tag]  = {};
  }



  this._sockets_connecting = [];  //正在连接中的socket，没有放入_sockets总仓库中

  //连接超时、异常关闭、连接错误等，，，该server则屏蔽一段时间连接
  this._avoid = {};     //格式：  {"127.0.0.1:80":[Time Last Checked, Time out length], ... } 
                        //意思：从最后check时间开始，Time out length这么多分钟以内保持限制avoid，超过了限制时间，就是可以用了的。
  this.available = [];            //空闲可用的socket

  this._queue = [];               //任务队列


  //开始填充pool
  this._fillPool();
}


/*
  获取socket的标签，tgs
*/
Pool.prototype.getTag = function(socket){
  //只会在这两个条件下。无他。
    if(socket.tag){
        return socket.tag;    //入pool时打的标签
    }else{
        return socket.remoteAddress+':'+socket.remotePort;
    }
}


/*
 * 所有host的所有连接总数。this._sockets
 */
Object.defineProperty(Pool.prototype, 'length', {
    get: function(){
        var props = Object.keys(this._sockets);
        var len = 0;
        for (var i = 0, l = props.length; i < l; i++) {
          len += Object.keys(this._sockets[props[i]]).length;
        }
        return len;
    }
})


/*
  给socket建立默认动作的listener。主要用于异常socket的清理
*/
Pool.prototype._addListener = function(socket){
  var self = this;
  socket.on('error', function(e) {      //'error' 当错误发生时触发。'close' 事件也会紧接着该事件被触发。只处理close即可。
      self._inspect('socket error:'+e.message+'...'+self.getTag(socket));
      self._removeSocketFromPool(socket);
  });
  socket.on('close', function() {
      self._inspect('socket close...'+self.getTag(socket));
      self._removeSocketFromPool(socket);
  });
  // socket.on('data', function() {     //这个由用户控制
  // });
  socket.on('timeout', function() {    
      self._inspect('socket timeout...'+self.getTag(socket));
      self._removeSocketFromPool(socket);
  });
  socket.on('end', function() {
      self._inspect('socket end...'+self.getTag(socket));
      socket.end();     //服务器单向关了。用户必须调用 end() 显示地结束这个连接（例如发送一个 FIN 数据包。）。end后完全关闭后，会触发close事件
  });
}


/*
  调试打印
*/
Pool.prototype._inspect = function(prefix){
  if(!this.debug){
    return;
  }
  while(prefix.length<61){
    prefix += ' ';
  }
  console.info(prefix + "\t" +
    '...queue len:'+this._queue.length+
    ', available len:'+this.available.length+
    ', connecting len:'+this._sockets_connecting.length+
    ', total connect:'+this.length+
    ', _avoid len:'+Object.keys(this._avoid).length
  );
}
/*
* 工具函数：从socket数组中删除指定socket
*/
Pool.prototype._delArraySocket = function(arr, socket){
    for(var i in arr){
        if(arr[i] === socket){
            arr.splice(i, 1);
        }
    }
    return arr;
}
/*
 *  Randomly generate ID, and ensures unique
 */
Pool.prototype.generateId = function(dest) {
  var id = Math.random().toString(16).substr(2);
  if (dest[id]) return generateId(dest);
  return id;
}



/*
 * 从pool中移出close或者error的socket
 * 可以重放调用无影响
 */
Pool.prototype._removeSocketFromPool = function(socket){
    if(!socket){
        return;
    }
    var ori_tag = self.getTag(socket);
    for(var i in this.available){
        if(this.available[i] === socket){   //删除这个socket
            this.available.splice(i, 1);
        }
    }
    for(var tag in this._sockets){
        for(var pid in this._sockets[tag]){
            if(this._sockets[tag][pid] === socket){
                delete(this._sockets[tag][pid]);
            }
        }
        if(Object.keys(this._sockets[tag]).length<1){   //清理这个tag
            delete(this._sockets[tag]);
        }
    }

    socket.end();
    socket = null;
    this._inspect('_removeSocketFromPool,'+ori_tag+',end,');
    this._fillPool();   //少了socket时，也触发一下
}


/*
 *  新建socket，数量:available>min, total<max
 *  递归调用
 */
Pool.prototype._fillPool = function() {
  var self = this;

  //超过限量停止
  if(self.available.length>=self.min ||
    self.length >= self.max ||
    self.available.length + self._sockets_connecting.length >= self.min || 
    self.length + self._sockets_connecting.length >= self.max
  ){
      return false;   //skiped _fillPool
  }

  var server = self._recommend();
  var servertag = server.host + ':' + server.port;
  if (!server) return;
  this._inspect('_recommend: '+servertag)

  var sock = new Socket();
  self._sockets_connecting.push(sock);
  //下面这些 Listener 仅在 connect 期间有效，，，connected 后，会清除。
  sock.once('error', function(err) {
    self._delArraySocket(self._sockets_connecting, sock);
    self._avoid[servertag] = self.calcServerTimeout(self._avoid[servertag]);
  });
  sock.once('timeout', function() {
    self._delArraySocket(self._sockets_connecting, sock);
    self._avoid[servertag] = self.calcServerTimeout(self._avoid[servertag]);
  });
  sock.once('close', function() {
    self._delArraySocket(self._sockets_connecting, sock);
    self._avoid[servertag] = self.calcServerTimeout(self._avoid[servertag]);
  });


  sock.once('connect', function() {
    self._delArraySocket(self._sockets_connecting, sock);   //when connected,  remove from _sockets_connecting
    delete(self._avoid[servertag]);                         //remove from avoid list

    self.addToPool(this);
    self._fillPool();
  });

  sock.connect(server.port, server.host);

  this._inspect('_fillPool end, now waiting connected...');
}



/*
*  Manually add a given socket into the pool
*  Regardless of maximum
*
*  Interally the pool uses this to add sockets,
*  but the maximum is checked via _ensure
*
*  Returns true if successful
*/
Pool.prototype.addToPool = function(socket) {
  // check its a socket & active
  if (!socket instanceof Socket || !socket._handle || socket._handle.fd <= 0 || !socket.remoteAddress || !socket.remotePort) {
    return false;
  }

  var self = this;
  var tag = self.getTag(socket);
  socket.tag = tag;               //给这个socket打标签。

  //动态修改servers配置时需要
  if (!self.servers[tag]){
      socket.end();
      return false;
  }

  //移出老的Listeners，新建新的Listeners
  socket.removeAllListeners();
  self._addListener(socket);

  //save to the store  存入总仓库
  if(!self._sockets[tag]){
      self._sockets[tag]={};
  }
  let pid = self.generateId(self._sockets[tag]);
  self._sockets[tag][pid] = socket;

  //save to the available
  let findflag = 0;
  for(var item of self.available){
    if(item === socket) findflag=1;
  }
  if(!findflag){
    self.available.unshift(socket);
    self._inspect('new socket into pool:'+tag);
  }


  //notify pool，通知队列消费者处理队列
  self._notifiyConsumer('from new');

  return true;
}



/*
*  通知消费者处理队列
*  from，来自新建的连接，还是复用已使用完的连接
*/
Pool.prototype._notifiyConsumer = function(from) {
  this._inspect('_notifiyConsumer start, from '+from+'...');

  while(this._queue.length && this.available.length){
    var fn      = this._queue.pop();
    var socket  = this.available.pop();
    //check active
    if(!socket._handle || !socket.writable){
      this._removeSocketFromPool(socket);
      continue;
    }

    //这里注意，必须要用闭包了。
    var delayFun = (function(so){
      return function(){
        fn(so);
      }
    })(socket);

    process.nextTick(delayFun);

    this._inspect('consume task:'+this.getTag(socket));
  }
}



/*
 *  从Pool中取出一个可用的socket，没有则返回undefined
 */
Pool.prototype.getClient = function() {
  this._inspect('getClient start');
  var sock = this.available.pop();
  if(!sock && this._sockets_connecting.length<this.min){       //_sockets_connecting非空表示_ensure已经在执行中了
      this._fillPool();
  }
  return sock;
};



/*
 *  用户塞入任务到队列
 */
Pool.prototype.adToQueue = function(fn) {
    let add_success = false;
    if(!this.maxQueueLen || this._queue.length < this.maxQueueLen){
        this._queue.unshift(fn);
        add_success = true;
    }
    this._fillPool();   //这个有必要在入口处触发循环。防止消息处理极端情况下停止。
    this._inspect('adToQueue end');
    return add_success;
};



/*
 * 用户使用完socket后，手动释放 pool.release(socket); 需用户主动调用
 * 可重放调用无影响
*/
Pool.prototype.release = function(socket){
  var self = this;

  //check active. if not, give up it
  if(!socket._handle || !socket.writable){
      self._removeSocketFromPool(socket);
      return;
  }
  //动态修改servers配置时，，对于已剔除的tag，，不用放回pool了
  if(Object.keys(self.servers).indexOf(self.getTag(socket)) < 0){
      self._removeSocketFromPool(socket);
      return;
  }

  //清理工作
  for(var tag in self._sockets){
      if(Object.keys(self._sockets[tag]).length < 1){
          delete(self._sockets[tag]);
      }
  }

  if(socket.bufferSize !== 0) {
      socket.once('drain', function() {   //这种大请求量情况下，有buffer的递归处理。
          self._inspect('waiting for drain...'+self.getTag(socket));
          self.release(socket);
      });
      return;
  }

  self._inspect('release socket into pool:'+self.getTag(socket));

  //save to the available
  let findflag = 0;
  for(var item of self.available){
      if(item === socket) findflag=1;
  }
  if(!findflag){
      socket.removeAllListeners();    //清理所有Listener（包括用户自定义的、默认Listener）
      self._addListener(socket);      //添加默认Listener
      self.available.unshift(socket);
  }

  //notify pool，通知队列消费者处理队列
  self._notifiyConsumer('from release');
}


/*
 * 动态修改servers配置，下次新建连接时生效，老的可用的socket继续可用1次。
 * servers，和新建pool时格式一样
*/
Pool.prototype.changeServers = function(servers){
/*socket循环，三个口子：
  1、新连接成功：addToPool();
  2、正常使用完：release();
  3、异常error,close：_removeSocketFromPool();

  对于已在用的socket，，release里有判断，会删除。
  对于available的socket，，继续用一次，但是不会放回pool了
  对于新建连接中的socket，也无法加入pool
  新_recommend时，将把新的servers配置考虑进去
*/
  this._avoid = {};
  this.servers = {};
  //this._sockets = {};

  for (var i = 0, l = servers.length; i < l; i++) {
    let tag = servers[i].host + ':' + servers[i].port;
    this.servers[tag]   = servers[i];
    if(!this._sockets[tag]){
      this._sockets[tag]  = {};
    }
  }
}



/*
 *销毁，清理
*/
Pool.prototype.destory = function(){
  this._recommend = function() {};
  this._fillPool = function() {};
  this.release = function() {};

  this.available = [];
  this._sockets_connecting = [];

  for(var tag in this._sockets){
    for(var pid in this._sockets[tag]){
      this._sockets[tag][pid].end();
      if(this._sockets[tag][pid].unref) this._sockets[tag][pid].unref(); // 0.8 compat check
      delete(this._sockets[tag][pid]);
    }
    delete this._sockets[tag];
  }

  this._sockets = {};
}




/*
 *  Example:
 *  [1,2,3] - [2] = [1,3]
 */
Pool.prototype.arrayDiff = function(arr, arr2) {
  return arr.filter(function(ele, idx, a) {
    return (arr2.every(function(ele2, idx2, a2) {
      return (ele2 !== ele);
    }));
  });
}

/*
 *  计算哪些ip:port当前是屏蔽掉的
 */
Pool.prototype.calcAvoidServers = function(serverObjs) {
  var servertags = Object.keys(serverObjs);
  if (!servertags.length)
    return [];
  var results = servertags.filter(function(ele, idx, arr) {
    var lastTime = serverObjs[ele][0];
    var timeoutLen = serverObjs[ele][1];
    var timeElapsed = (Date.now() - lastTime) / 1000 / 60;
    if (timeElapsed >= timeoutLen) {        //超过了屏蔽时间的，则为有效
      return false;
    } else {                                //在屏蔽时间内的，则为avoid的
      return ele;
    }
  });
  return results;
}

/*
 *  Calculate avoid server times
 *  Expects and returns [Time Last Checked, Time out length]
 */
Pool.prototype.calcServerTimeout = function(arr) {
  if (arr && arr.length) {
    var lastTime = arr[0];
    var timeoutLen = arr[1];
    var timeElapsed = (Date.now() - lastTime) / 1000 / 60;
      // time has passed, double timeout
    if (timeElapsed >= timeoutLen) {
      timeoutLen = timeoutLen * 2;
      if (timeoutLen >= 128) timeoutLen = 128;
      return [Date.now(), timeoutLen];
    } else {
      // elapsed time hasn't passed to do anything
      return arr;
    }
  } else {
    // when undefined, new timeout
    return [Date.now(), 2];
  }
}


/*
 *  负载均衡。决定取哪一个ip:port进行连接
 */
Pool.prototype._recommend = function() {
  var serverkeys = Object.keys(this.servers);

  // what servers should the pool avoid?
  var avoidservers = this.calcAvoidServers(this._avoid);     //_avoid中，超时但未过期的servertag
  if (avoidservers.length){
    serverkeys = this.arrayDiff(serverkeys, avoidservers);   //可以进行新建连接的ip:port
  }


  // get total weight
  var total_weight = 0;
  for (var i = 0; i < serverkeys.length; i++) {
    total_weight += this.servers[serverkeys[i]].weight;
  }

  // keeps recommending after maxmium has met
  var totalsockets = this.length;
  var max = this.max;
  if (totalsockets > max) max = totalsockets + 1;

  // calculate proportion, ordering is based on Object.keys
  var ret;
  var proportionMet = 1.0;

  for (var i = 0; i < serverkeys.length; i++) {
    var requirement = Math.round(max / (total_weight / this.servers[serverkeys[i]].weight));  //当前host（serverkeys[i]）最大连接数量的分配
    // requirement met?
    var sockLenForServer = 0;                                                                 //当前host（serverkeys[i]）目前连接数量
    if(this._sockets[serverkeys[i]]){
      sockLenForServer = Object.keys(this._sockets[serverkeys[i]]).length;
    }
    var thisPropertion = sockLenForServer / requirement;                                      //当前host（（serverkeys[i]））连接数使用比例，不能大于1

    // if 0 and in need we can return early
    if (sockLenForServer === 0 && sockLenForServer < requirement) {
      return this.servers[serverkeys[i]];
    } else if (thisPropertion < proportionMet) {        //循环一遍，取使用比例最小的server tag
      proportionMet = thisPropertion;
      ret = this.servers[serverkeys[i]];
    }
  }
  return ret;                                           //返回server tag
};


module.exports = Pool;
