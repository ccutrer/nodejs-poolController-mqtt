/*  nodejs-poolController.  An application to control pool equipment.
 *  Copyright (C) 2016, 2017.  Russell Goldin, tagyoureit.  russ.goldin@gmail.com
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as
 *  published by the Free Software Foundation, either version 3 of the
 *  License, or (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */


//This makes the module available to the app through BottleJS
module.exports = function(container) {

    //load the configuration file
    var configFile = container.settings.getConfig()
        //and read the variables we put there
    var level = configFile.outputSocketToMQTT.level
    var protocol_http = configFile.poolController.http.enabled
    var protocol_https = configFile.poolController.https.enabled
    var serverURL;
    var secureTransport;
    //The following IF statement sets the varibles if the transport is either HTTP or HTTPS
    if (protocol_https === 0) {
        serverURL = 'http://localhost:' + bottle.container.settings.get('httpExpressPort') + '/'
        secureTransport = false
    } else {
        serverURL = 'https://localhost:' + bottle.container.settings.get('httpsExpressPort') + '/'
        secureTransport = true
    }

    //setup mqtt
	var mqtt = require('mqtt')
    var client = mqtt.connect(configFile.outputSocketToMQTT.mqttUrl)

  //setup jsonata
   	var jsonata = require("jsonata") 
   	
	client.on('connect', ()=> {
		client.subscribe('pool/circuit/1/status')
		client.subscribe('pool/circuit/2/status')
		client.subscribe('pool/circuit/3/status')
		client.subscribe('pool/circuit/4/status')
		client.subscribe('pool/circuit/5/status')
		client.subscribe('pool/circuit/6/status')
		
		client.publish('pool/connected','true')
		})

    //we listen to events with the socket client
    var io = container.socketClient
    var socket = io.connect(serverURL, {
        secure: secureTransport,
        reconnect: true,
        rejectUnauthorized: false
    });


    //This is a listener for the circuit event.  data is what is received.
    socket.on('circuit', function(data) {
      	console.log('outputSocketToMQTT: Cicuit info as follows: %s', JSON.stringify(data))
  			//check if json is for equipment or lights
  			if (typeof(jsonata("$[0].circuit.'1'.number").evaluate(data)) !== 'undefined') {
  				var check_circuit = jsonata("$[0].circuit.'1'.number").evaluate(data)
  			}else {
  				var check_circuit = 0
  			}
  			if (check_circuit==1){
  					console.log(`${check_circuit}`)
  					//determine number of circuits
  			   	var num_circuits = jsonata("$count($[0].circuit.*)").evaluate(data)
  			   	for (i=1; i<=num_circuits;i++) {
  			   			var j = "$[0].circuit.'"+String(i)+"'.status"
							var circuit_status = jsonata(j).evaluate(data)
						   console.log(circuit_status)
						   sendMqttCircuitStatus(`${i}`,circuit_status)
				   }
			}
    })

//This is a listener for the temperature event.  data is what is received.
    socket.on('temperature', function(data) {
      	console.log('outputSocketToMQTT: Temperature info as follows: %s', JSON.stringify(data))
				var airTemp = jsonata("temperature.airTemp").evaluate(data)
				var poolTemp = jsonata("temperature.poolTemp").evaluate(data)
  				var poolHeatMode = jsonata("temperature.poolHeatMode").evaluate(data)
				var poolSetpoint = jsonata("temperature.poolSetPoint").evaluate(data)
				var spaTemp = jsonata("temperature.spaTemp").evaluate(data)
  				var spaHeatMode = jsonata("temperature.spaHeatMode").evaluate(data)
  				var spaSetpoint = jsonata("temperature.spaSetPoint").evaluate(data)
  				sendMqttHeatStatus(airTemp,poolHeatMode,poolTemp,poolSetpoint,spaHeatMode,spaTemp,spaSetpoint)
	})

    //The 'error' function fires if there is an error connecting to the socket
    socket.on('error', function(err) {
        console.log('outputSocketToMQTT: Error connecting to socket @ %s (secure: %s)', serverURL, secureTransport)
    })

    //Function to send circuit status update via mqtt
	function sendMqttCircuitStatus(circuit, status) {
		//console.log('Circuit %s', circuit + ' status is ',status)
		//console.log('MQTT Topic is: pool/circuit/%s', circuit + '/%s', status)
		//client.publish('pool/circuit/%s',circuit + '/%s', status)
		console.log(`Circuit ${circuit} status is ${status}`)
		console.log(`MQTT Topic is: pool/circuit/${circuit}/${status}`)
		var circuit_str = "pool/circuit/"+String(circuit)+"/status"
		var status_str = String(status)
		client.publish(circuit_str,status_str)
 	} 

//Function to send circuit status update via mqtt
	function sendMqttHeatStatus(airTemp, poolHeatMode, poolTemp, poolSetpoint, spaHeatMode, spaTemp, spaSetpoint) {
		console.log(`Pool Heat status is ${poolHeatMode}`)
		console.log(`Spa Heat status is ${spaHeatMode}`)

		client.publish("pool/air/temp", String(airTemp))
		client.publish("pool/poolheat/mode/status", String(poolHeatMode))
		client.publish("pool/poolheat/temp", String(poolTemp))
		client.publish("pool/poolheat/setpoint", String(poolSetpoint))
		client.publish("pool/spaheat/mode/status", String(spaHeatMode))
		client.publish("pool/spaheat/temp", String(spaTemp))
		client.publish("pool/spaheat/setpoint", String(spaSetpoint))
 	}

    //This init can be this simple.  It just lets us know the integration is running
    function init() {
        //to log through all the logger channels (formatting, to the Bootstrap debug, etc, use "container.logger")
        //we are using our variable, level, to set the level of the logger here
        container.logger[level]('outputSocketToMQTT Loaded.')
    }

    //This makes the init() function available to the app globally
    return {
        init: init
    }
}
