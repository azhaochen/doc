//用于测试socketpool.js文件

var Socket = require('net').Socket;
var Pool = require('./socketpool.js');

//testClient();
testPool();


//测试连接池
function testPool(){
    var pool = new Pool([
      //{ host: '127.0.0.1', port: 80, weight: 0.5 },           //本机http接口，一次后会端开
      { host: '10.49.99.161', port: 5792, weight: 0.5 },    //后台查询接口   cmd字符串：
      { host: '10.49.99.161', port: 5702, weight: 0.5 },
    ], {
      min: 2,
      max: 5,
      debug: 1,
    });

    var cmd = "cmd=57920701&uin=615628103";
    cmd += "\n";

    var do_stuff_with_socket = function(socket) {
      socket.on('data', function(data) {
        console.info('.................',socket.remotePort, data/*data.toString('utf8*/);
        pool.release(socket);
      });
      socket.on('close', function(){
        console.info('.....user interface socket closed....');
      })
      socket.write(cmd);
    }

    setTimeout(function(){
        for(var i=0; i<6; i++){
            var socket = pool.getClient();
            if (socket) {
              do_stuff_with_socket(socket);
            } else {
              pool.adToQueue(do_stuff_with_socket);
            }
        }
    },1000);
}


//测试单连接。 （复用关闭连接的问题）
function testClient(){
    var sock = new Socket();
    sock.once('error', function(err) {
        console.log('socket error...')
    });
    sock.once('timeout', function() {
        console.log('socket timeout...')
    });
    sock.once('close', function() {
        console.log('socket close...')
    });
    sock.connect(80, '127.0.0.1');
    sock.once('connect', function() {
        let a = sock.write("aaaaaaaaaaaaaaaaa\n");
        console.log('socket write.....',a);
        console.log('socket._handle...',    typeof sock._handle);   //https://stackoverflow.com/questions/18591989/nodejs-this-socket-is-closed
        console.log('socket.readable...',   sock.readable);         //check socket is availabe
        console.log('socket.writable...',   sock.writable);         //https://github.com/nodejs/node/issues/21431
    });
    sock.on('data',function(data){
        console.log('socket receive data...',data);     //服务器回复后立刻关闭连接了，，'data'消息后会立马触发'close'事件。
        let a = sock.write("aaaaaaaaaaaaaaaaa\n");      //第二次发送后就丢失了，，而且无感知。
        console.log('socket write.....',a);
        console.log('socket._handle...',    typeof sock._handle);
        console.log('socket.readable...',   sock.readable);
        console.log('socket.writable...',   sock.writable);

        setTimeout(function(){
            console.log('next tick...',sock, sock.remotePort, sock.remoteAddress)        //还是会在close事件之前。因此在close之前事件，socket是无效的，且无法感知。
        },5*1000);
    })


    /*执行结果：
        socket write..... true
        socket receive data... <Buffer 3c 21 44 4f 43 54 59 50 45 2 3e ... >
        socket write..... true
        socket close...
    */
}



//var socket = pool.get();
//
//// get is 'sync', you either get back a socket or you don't
//if (socket) {
//  do_stuff_with_socket(socket);
//} else {
//  // if there's no available socket... 
//
//  // we can queue and let the pool
//  // call it whenever a socket is available
//  pool.queue(do_stuff_with_socket);
//
//
//  // Or we can create our own socket for now...
//  //socket = new Socket();
//  //socket.connect(...)
//  //.... do some stuff with the socket ...
//  // when we're done we can give it to the pool too
//  //pool.add(socket);
//}
