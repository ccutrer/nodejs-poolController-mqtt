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
    var level = configFile.mqttHomie.level
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
    var gotCircuits = false
    var gotTemp = false
    var gotChlorinator = false
    var gotIntellichem = false
    var ready = false

    var mqttPrefix = configFile.mqttHomie.mqttPrefix
    if (mqttPrefix === undefined) {
        mqttPrefix = 'homie/nodejs-poolController'
    }

    var client = mqtt.connect(configFile.mqttHomie.mqttUrl,
        { will: { topic: `${mqttPrefix}/$state`, payload: 'lost', qos: 1, retain: true } })


    var lastValue = {}
    function publish(topic, value) {
        if (lastValue[topic] !== value) {
            lastValue[topic] = value
            console.log(`Publishing '${value}' to '${topic}'`)
            client.publish(topic, value, { qos: 1, retain: true })
        }
    }

    var nodes = 'air,pool,spa,heater'
    client.on('connect', ()=> {
        console.log(`mqttHomie: publishing ${mqttPrefix}/$homie`)
        publish(`${mqttPrefix}/$homie`, 'v4.0.0')
        publish(`${mqttPrefix}/$name`, 'nodejs-poolController')
        for (var i = 1; i <= 20; ++i) {
            nodes += `,circuit${i}`
        }
        publish(`${mqttPrefix}/$nodes`, nodes)
        publish(`${mqttPrefix}/$extensions`, '')
        publish(`${mqttPrefix}/$state`, 'init')

        publish(`${mqttPrefix}/air/$name`, 'Outside Air')
        publish(`${mqttPrefix}/air/$type`, 'a')
        publish(`${mqttPrefix}/air/$properties`, 'temperature')

        publish(`${mqttPrefix}/air/temperature/$name`, 'Outside Air Temperature')
        publish(`${mqttPrefix}/air/temperature/$datatype`, 'integer')
        publish(`${mqttPrefix}/air/temperature/$unit`, '°F')


        publish(`${mqttPrefix}/pool/$name`, 'Pool')
        publish(`${mqttPrefix}/pool/$type`, 'b')
        publish(`${mqttPrefix}/pool/$properties`, 'temperature,setpoint')

        publish(`${mqttPrefix}/pool/temperature/$name`, 'Pool Temperature')
        publish(`${mqttPrefix}/pool/temperature/$datatype`, 'integer')
        publish(`${mqttPrefix}/pool/temperature/$unit`, '°F')

        publish(`${mqttPrefix}/pool/setpoint/$name`, 'Pool Set Point Temperature')
        publish(`${mqttPrefix}/pool/setpoint/$datatype`, 'integer')
        publish(`${mqttPrefix}/pool/setpoint/$unit`, '°F')
        publish(`${mqttPrefix}/pool/setpoint/$settable`, 'true')
        client.subscribe(`${mqttPrefix}/pool/setpoint/set`)



        publish(`${mqttPrefix}/spa/$name`, 'Pool')
        publish(`${mqttPrefix}/spa/$type`, 'c')
        publish(`${mqttPrefix}/spa/$properties`, 'temperature,setpoint')

        publish(`${mqttPrefix}/spa/temperature/$name`, 'Spa Temperature')
        publish(`${mqttPrefix}/spa/temperature/$datatype`, 'integer')
        publish(`${mqttPrefix}/spa/temperature/$unit`, '°F')

        publish(`${mqttPrefix}/spa/setpoint/$name`, 'Spa Set Point Temperature')
        publish(`${mqttPrefix}/spa/setpoint/$datatype`, 'integer')
        publish(`${mqttPrefix}/spa/setpoint/$unit`, '°F')
        publish(`${mqttPrefix}/spa/setpoint/$settable`, 'true')
        client.subscribe(`${mqttPrefix}/spa/setpoint/set`)


        publish(`${mqttPrefix}/heater/$name`, 'Heater')
        publish(`${mqttPrefix}/heater/$type`, 'e')
        publish(`${mqttPrefix}/heater/$properties`, 'active')

        publish(`${mqttPrefix}/heater/active/$name`, 'Heater Active')
        publish(`${mqttPrefix}/heater/active/$datatype`, 'boolean')



        for (i = 1; i <= 20; i++) {
            publish(`${mqttPrefix}/circuit${i}/$type`, 'e')
            publish(`${mqttPrefix}/circuit${i}/$properties`, 'status,freeze,function')

            publish(`${mqttPrefix}/circuit${i}/status/$name`, 'Circuit Status')
            publish(`${mqttPrefix}/circuit${i}/status/$datatype`, 'boolean')
            publish(`${mqttPrefix}/circuit${i}/status/$settable`, 'true')
            client.subscribe(`${mqttPrefix}/circuit${i}/status/set`)

            publish(`${mqttPrefix}/circuit${i}/freeze/$name`, 'Freeze Protect')
            publish(`${mqttPrefix}/circuit${i}/freeze/$datatype`, 'boolean')

            publish(`${mqttPrefix}/circuit${i}/function/$name`, 'Function')
            publish(`${mqttPrefix}/circuit${i}/function/$datatype`, 'enum')
            publish(`${mqttPrefix}/circuit${i}/function/$format`, 'Pool,Spa,Generic,Light,Intellibrite')
        }
    })

    client.on('message', (topic, message) => {
        console.log(`mqttHome: received MQTT '${message}' topic ${topic}`)
        topic = topic.substr(mqttPrefix.length + 1)
        var node
        var property
        [node, property] = topic.split("/")
        if (property === "status" && node.startsWith("circuit")) {
          var circuit = parseInt(node.substr(7))
          var status = (message == 'false' ? 0 : 1)
          socket.emit('setCircuit', circuit, status)
        } else if (property === "setpoint") {
          var func = (node === "pool") ? "setPoolSetPoint" : "setSpaSetPoint"
          socket.emit(func, Math.round(parseFloat(message)))
        }
    })

    //we listen to events with the socket client
    var io = container.socketClient
    var socket = io.connect(serverURL, {
        secure: secureTransport,
        reconnect: true,
        rejectUnauthorized: false
    })


    // Handle events from poolController
    socket.on('circuit', function(data) {
      	console.log('mqttHomie: Circuit info as follows: %s', JSON.stringify(data))
        if (data.circuit['1'].number === undefined) {
            return;
        }
        if (gotTemp && !ready) {
            ready = true
            publish(`${mqttPrefix}/$state`, 'ready')
        }

        for (i in data.circuit) {
            circuit = data.circuit[i]

            if (!gotCircuits) {
              publish(`${mqttPrefix}/circuit${i}/status/$name`, `${circuit.friendlyName} Circuit Status`)
              publish(`${mqttPrefix}/circuit${i}/freeze/$name`, `${circuit.friendlyName} Circuit Freeze Protect`)
              publish(`${mqttPrefix}/circuit${i}/function/$name`, `${circuit.friendlyName} Circuit Function`)
            }
            publish(`${mqttPrefix}/circuit${i}/$name`, circuit.friendlyName)
            publish(`${mqttPrefix}/circuit${i}/status`, String(circuit.status === 1))
            publish(`${mqttPrefix}/circuit${i}/freeze`, String(circuit.freeze === 1))
            publish(`${mqttPrefix}/circuit${i}/function`, circuit.circuitFunction)
        }
        gotCircuits = true
    })

    socket.on('temperature', function(data) {
      	console.log('mqttHomie: Temperature info as follows: %s', JSON.stringify(data))
        gotTemp = true
        if (gotCircuits && !ready) {
            ready = true
            publish(`${mqttPrefix}/$state`, 'ready')
        }

        publish(`${mqttPrefix}/air/temperature`, String(data.temperature.airTemp))
        publish(`${mqttPrefix}/pool/temperature`, String(data.temperature.poolTemp))
        if (data.temperature.poolSetPoint !== undefined) {
            publish(`${mqttPrefix}/pool/setpoint`, String(data.temperature.poolSetPoint))
        }
        publish(`${mqttPrefix}/spa/temperature`, String(data.temperature.spaTemp))
        if (data.temperature.spaSetPoint !== undefined) {
            publish(`${mqttPrefix}/spa/setpoint`, String(data.temperature.spaSetPoint))
        }
        publish(`${mqttPrefix}/heater/active`, String(data.temperature.heaterActive === 1))
    })

    socket.on('chlorinator', function(data) {
        console.log('mqttHomie: Chlorinator info as follows: %s', JSON.stringify(data))
        if (!data.chlorinator.installed) {
          return;
        }

        if (!gotChlorinator && data.chlorinator.installed) {
            gotChlorinator = true
            publish(`${mqttPrefix}/chlorinator/$name`, 'Chlorinator')
            publish(`${mqttPrefix}/chlorinator/$type`, data.chlorinator.name)
            publish(`${mqttPrefix}/chlorinator/$properties`, 'salt,output,superchlorinate')

            publish(`${mqttPrefix}/chlorinator/salt/$name`, 'Salt Level')
            publish(`${mqttPrefix}/chlorinator/salt/$datatype`, 'integer')
            publish(`${mqttPrefix}/chlorinator/salt/$unit`, 'ppm')

            publish(`${mqttPrefix}/chlorinator/output/$name`, 'Current Output')
            publish(`${mqttPrefix}/chlorinator/output/$datatype`, 'integer')
            publish(`${mqttPrefix}/chlorinator/output/$unit`, '%')
            publish(`${mqttPrefix}/chlorinator/output/$format`, '0:100')

            publish(`${mqttPrefix}/chlorinator/superchlorinate/$name`, 'Super Chlorinator Status')
            publish(`${mqttPrefix}/chlorinator/superchlorinate/$datatype`, 'boolean')

            nodes += ',chlorinator'
            publish(`${mqttPrefix}/$nodes`, nodes)
        }

        publish(`${mqttPrefix}/chlorinator/salt`, String(data.chlorinator.saltPPM))
        publish(`${mqttPrefix}/chlorinator/output`, String(data.chlorinator.currentOutput))
        publish(`${mqttPrefix}/chlorinator/superchlorinate`, String(data.chlorinator.superChlorinate === 1))

    })

    socket.on('intellichem', function(data) {
        console.log('mqttHomie: intellichem info as follows; %s', JSON.stringify(data))
        if (!gotIntellichem) {
          gotIntellichem = true;

            publish(`${mqttPrefix}/intellichem/$name`, 'IntelliChem')
            publish(`${mqttPrefix}/intellichem/$properties`, 'ph,orp,cya,ch,ta,tank1level,tank2level')

            publish(`${mqttPrefix}/intellichem/ph/$name`, 'pH Level')
            publish(`${mqttPrefix}/intellichem/ph/$datatype`, 'float')

            publish(`${mqttPrefix}/intellichem/orp/$name`, 'ORP')
            publish(`${mqttPrefix}/intellichem/orp/$datatype`, 'integer')

            publish(`${mqttPrefix}/intellichem/cya/$name`, 'Cyanuric Acid Level (Setting)')
            publish(`${mqttPrefix}/intellichem/cya/$datatype`, 'integer')

            publish(`${mqttPrefix}/intellichem/ch/$name`, 'Calcium Hardness (Setting)')
            publish(`${mqttPrefix}/intellichem/ch/$datatype`, 'integer')

            publish(`${mqttPrefix}/intellichem/ta/$name`, 'Total Alkalinity (Setting)')
            publish(`${mqttPrefix}/intellichem/ta/$datatype`, 'integer')

            publish(`${mqttPrefix}/intellichem/tank1level/$name`, 'Tank 1 Level')
            publish(`${mqttPrefix}/intellichem/tank1level/$datatype`, 'integer')

            publish(`${mqttPrefix}/intellichem/tank2level/$name`, 'Tank 2 Level')
            publish(`${mqttPrefix}/intellichem/tank2level/$datatype`, 'integer')

            nodes += ',intellichem'
            publish(`${mqttPrefix}/$nodes`, nodes)
        }

        publish(`${mqttPrefix}/intellichem/ph`, String(data.intellichem.readings.PH))
        publish(`${mqttPrefix}/intellichem/orp`, String(data.intellichem.readings.ORP))
        publish(`${mqttPrefix}/intellichem/cya`, String(data.intellichem.settings.CYA))
        publish(`${mqttPrefix}/intellichem/ch`, String(data.intellichem.settings.CALCIUMHARDNESS))
        publish(`${mqttPrefix}/intellichem/ta`, String(data.intellichem.settings.TOTALALKALINITY))
        publish(`${mqttPrefix}/intellichem/tank1level`, String(data.intellichem.tankLevels['1']))
        publish(`${mqttPrefix}/intellichem/tank2level`, String(data.intellichem.tankLevels['2']))
    })

    //The 'error' function fires if there is an error connecting to the socket
    socket.on('error', function(err) {
        console.log('mqttHomie: Error connecting to socket @ %s (secure: %s)', serverURL, secureTransport)
    })


    //This init can be this simple.  It just lets us know the integration is running
    function init() {
        //to log through all the logger channels (formatting, to the Bootstrap debug, etc, use "container.logger")
        //we are using our variable, level, to set the level of the logger here
        container.logger[level]('mqttHomie Loaded.')
    }

    //This makes the init() function available to the app globally
    return {
        init: init
    }
}
