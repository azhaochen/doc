# author: azhaochen
# time: 2019-03-19
# how to setup python+selenium+chrome enviroment: https://cloud.tencent.com/developer/article/1404558

import time
import requests
import json

from selenium import webdriver							#selenium doc: https://selenium-python-zh.readthedocs.io/en/latest/faq.html
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from apscheduler.schedulers.blocking import BlockingScheduler



option = ''
browser = ''


def loginCsdn():
	loginUrl = r"https://passport.csdn.net/login"
	wait = WebDriverWait(browser, 10);
	browser.get(loginUrl)
	print(browser.title)

	namepasslogin  = wait.until(EC.presence_of_element_located((By.XPATH, '//*[@id="app"]/div/div/div/div[2]/div[4]/ul/li[2]/a')));
	namepasslogin.click()
	
	
	userInput = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "#all")));
	password  = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "#password-number")));
	submit    = wait.until(EC.presence_of_element_located((By.XPATH, '//*[@id="app"]/div/div/div/div[2]/div[4]/form/div/div[6]/div/button')));
	
	userInput.clear()
	userInput.send_keys('aaaaaaa')			#TODO: your csdn username
	password.clear()
	password.send_keys('bbbbbbb')			#TODO: your csdn password
	print(1)
	wait.until(EC.text_to_be_present_in_element_value((By.CSS_SELECTOR, "#all"), 'c4501srsy'))
	print(2)
	wait.until(EC.text_to_be_present_in_element_value((By.CSS_SELECTOR, "#password-number"), 'srsy761212804'))
	print(3)
	submit.click()
	time.sleep(3)

	browser.get_screenshot_as_file("/data/nodeproj/wxserver/public/html/login.png")	#http://134.175.16.24/html/login.png
	

def getNotes():
	browser.get("https://blog.csdn.net/c4501srsy/article/details/88663564")		#TODO: your own csdn secret page
	print(browser.title)
	html = browser.find_element_by_id('content_views').get_attribute('innerHTML').strip()
	print(html)
	return html

	
def sendPushBear(content):
	apiUrl 	= "https://pushbear.ftqq.com/sub"	#TODO: pushbear api:  https://pushbear.ftqq.com
	key 	= "aaaaaaa"				#TODO: your own pushbear key
	
	payload = {
	  "sendkey": key,
	  "desp": content,
	  "text": ".............TODO............",
	}
	
	r = requests.post(apiUrl, data=payload, verify=False)
	print(r.content)
	

def timer_job():
	global option, browser;
	option = webdriver.ChromeOptions()
	option.add_argument('headless')
	option.add_argument('no-sandbox')
	option.add_argument('disable-dev-shm-usage')
	browser = webdriver.Chrome('/usr/local/bin/chromedriver',chrome_options=option)

	loginCsdn()
	content = getNotes()
	sendPushBear(content)
	
	browser.quit()

	
	
def main():
	sched = BlockingScheduler()
	sched.add_job(timer_job, 'cron',
		day_of_week='0-6',
		hour='09',
		minute='00',
		second='00',
	)
	sched.start()


if __name__ == '__main__':
	main()


