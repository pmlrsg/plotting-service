# Running the Plotting Service perpetually

There are a number of options available to getting the plotting service to run perpetually as opposed to just running ```node app.js``` from the command line and hoping that it doesn't crash or you accidentally close the terminal window. These include:
* forever (https://github.com/nodejitsu/forever) - A node based monitoring app, installed using npm. Allows you to monitor multiple apps, specify log file location for each, automatically restarts apps that stop/break with a maximum retry count before it gives up.  
* Supervisor (http://supervisord.org/) - A python based yum installable application that manages multiple apps; details of each app are stored within individual .ini files. It has a simple web interface that runs on a specifiable port that shows you to see the status app of each configured app, stop/start/restart individual apps (or all at once), view/tail the log file.   
*  Circusd (http://circus.readthedocs.org/en/0.11.1/) - Very similar to supervisord, although it does have a distinct advantage of port binding. You configure a command to run, in our case a node app, and then you tie this to the port that it listens on; the application is only started when there is a request on the specified port  
* systemd (http://www.freedesktop.org/wiki/Software/systemd/) - like it or hate it, it's a system and service manager that is increasingly becoming the default in many Linux distributions. We use Fedora and so it's already installed

## Using systemd

Create a new file as ```/etc/systemd/system/plotting-service.service``` and add the following to it:
```
[Unit]
Description=Plotting Service

[Service]
ExecStart=/usr/bin/node /path/to/the/plotting-service/app.js

[Install]
WantedBy=multi-user.target
```
Save and close the file.

### To start the service

You will first have to enable the service, this will ensure that it restarts if/when your machine reboots; to do this:
```
systemctl enable plotting-service.service
```
Then start the service:
```
systemctl start plotting-service.service
```
