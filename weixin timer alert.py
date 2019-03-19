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


def loginShimo():
	loginUrl = r"https://shimo.im/login"
	wait = WebDriverWait(browser, 10);
	browser.get(loginUrl)
	print(browser.title)
	#userInput = wait.until(EC.presence_of_element_located((By.XPATH, '//*[@id="root"]/div/div[1]/div[1]/div/div/div[2]/div/div/div[1]/div[1]/div/input')));
	userInput = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "input[name='mobileOrEmail']")));	#css selector : https://saucelabs.com/resources/articles/selenium-tips-css-selectors
	password  = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "input[name='password']")));
	submit    = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "button.sm-button")));
	
	userInput.clear()
	userInput.send_keys('19928803232')
	password.clear()
	password.send_keys('shirishiyue')
	print(1)
	wait.until(EC.text_to_be_present_in_element_value((By.CSS_SELECTOR, "input[name='mobileOrEmail']"), '19928803232'))
	print(2)
	wait.until(EC.text_to_be_present_in_element_value((By.CSS_SELECTOR, "input[name='password']"), 'shirishiyue'))
	print(3)
	submit.click()

	#browser.implicitly_wait(10) # wait login jump



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
	userInput.send_keys('c4501srsy')
	password.clear()
	password.send_keys('srsy761212804')
	print(1)
	wait.until(EC.text_to_be_present_in_element_value((By.CSS_SELECTOR, "#all"), 'c4501srsy'))
	print(2)
	wait.until(EC.text_to_be_present_in_element_value((By.CSS_SELECTOR, "#password-number"), 'srsy761212804'))
	print(3)
	submit.click()
	time.sleep(3)

	browser.get_screenshot_as_file("/data/nodeproj/wxserver/public/html/login.png")	#http://134.175.16.24/html/login.png
	

def getNotes():
	browser.get("https://blog.csdn.net/c4501srsy/article/details/88663564")		#secret self notes
	print(browser.title)
	html = browser.find_element_by_id('content_views').get_attribute('innerHTML').strip()
	print(html)
	return html

	
def sendPushBear(content):
	apiUrl 	= "https://pushbear.ftqq.com/sub"
	key 	= "11750-b091cbfc69093b366214d5e93419db6b"
	
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


