"use strict";

var express = require('express');
var bodyParser = require('body-parser');
var request = require('request');
var limdu = require('limdu');
var Client = require('node-rest-client').Client;
var app = express();
var responses = require('./responses');
var mysql = require('mysql');
var http = require('https');

var client = new Client();
var isClassifierLoaded = false;

var verify_token = '2decembre1993';
var token = "EAAXfWnC8oMwBAHwJKSE2AVT6t5qm0OQRlUUtJhPucm4C7cSPjN8YYJvv4ZBv7fBDVVoHLRhXGMh5JobzITY5XNioyJCHTZB8nzLpkimLCWFQa2gJHCdxXF6ET8zkL4ZB64TgP1V4OxUZASKvPoff22URIWDlqnFmPwem9o7IJAZDZD";

app.use(bodyParser.json());

//connexion avec la base de donnees/
var connection = mysql.createConnection({
  host     : 'vps389603.ovh.net',
  user     : 'mlarhrouch',
  password : '@Ifta7yasimsim',
  database : 'maghribi'
});

connection.connect(function(err){
	if(!err) {
	    console.log("Database is connected ... ");    
	} else {
	    console.log("Error connecting database ... ");    
	}
});


// First, define our base classifier type (a multi-label classifier based on winnow):
var TextClassifier = limdu.classifiers.multilabel.BinaryRelevance.bind(0, {
    binaryClassifierType: limdu.classifiers.Winnow.bind(0, { retrain_count: 10 })
});

var WordExtractor = function (input, features) {
    input.split(" ").forEach(function (word) {
        features[word] = 1;
    });
};

// Initialize a classifier with the base classifier type and the feature extractor:
var intentClassifier = new limdu.classifiers.EnhancedClassifier({
    classifierType: TextClassifier,
    normalizer: limdu.features.LowerCaseNormalizer,
    featureExtractor: WordExtractor
});


function doTrain() {

    intentClassifier.trainBatch([
		{ input: "salam", output: "salam" },
		{ input: "bsr", output: "bonsoir" },
		{ input: "bonsoir", output: "bonsoir" },
		{ input: "bjr", output: "bonjour" },
		{ input: "bonjour", output: "bonjour" },
		{ input: "wa fine", output: "wafine" },
		{ input: "chi jadid", output: "jadid" },
    ]);

};

function doClassifier(str) {

    var res = intentClassifier.classify(str);
    return res;
}

function response(input) {
    var res = doClassifier(input);

    if (res != null && res.length > 0) {
        var response = responses[res[0]];

        if (response != null && response.length > 0) {
            if(response[0] == ""){
                return;
            }
            return response[random(response.length)];
        }
    }

    return "I can't understand !";
}

function random (max) {
    return parseInt(Math.random() * max);
}

function receivedMessage(event) {

    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfMessage = event.timestamp;
    var message = event.message;

    console.log("Received message for user %d and page %d at %d with message:",
      senderID, recipientID, timeOfMessage);

    var messageId = message.mid;

    // You may get a text or attachment but not both
    var messageText = message.text;
    var messageAttachments = message.attachments;

    if (messageText) {

        var msg = messageText.toLowerCase();
        var text = msg;

        sendTextMessage(senderID, response(text));
    }
}

function getUserInfo(userId, callback){


	http.get('https://graph.facebook.com/v2.6/'+userId
			+'?fields=first_name,last_name,profile_pic,locale,timezone,gender&access_token='+token, (res) => {
	  const statusCode = res.statusCode;
	  const contentType = res.headers['content-type'];

	  var error;
	  if (statusCode !== 200) {
	    error = new Error(`Request Failed.\n` +
	                      `Status Code: ${statusCode}`);
	  } 
	  if (error) {
	    console.log(error.message);
	    // consume response data to free up memory
	    res.resume();
	    return;
	  }

	  res.setEncoding('utf8');
	  let rawData = '';
	  res.on('data', (chunk) => rawData += chunk);
	  res.on('end', () => {
	    try {
	      let parsedData = JSON.parse(rawData);
	      callback(parsedData);
	    } catch (e) {
	      console.log(e.message);
	      callback(null);
	    }
	  });
	}).on('error', (e) => {
	  console.log(`Got error: ${e.message}`);
	});

}

function sendTextMessage(recipientId, messageText) {

    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: messageText
        }
    };

    callSendAPI(messageData);

}

function callSendAPI(messageData) {
    request({
        uri: 'https://graph.facebook.com/v2.6/me/messages',
        qs: { access_token: token },
        method: 'POST',
        json: messageData

    }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var recipientId = body.recipient_id;
            var messageId = body.message_id;

            console.log("Successfully sent generic message with id %s to recipient %s",
              messageId, recipientId);
        } else {
            console.error("Unable to send message.");
            console.error(response);
            console.error(error);
        }
    });
}

app.get('/', function (req, res) {

    if (req.query['hub.verify_token'] === verify_token) {
        res.send(req.query['hub.challenge']);
    }

    res.send('Error, wrong validation token');

});

app.post('/', function (req, res) {
    var data = req.body;

    // Make sure this is a page subscription
    if (data.object == 'page') {
        // Iterate over each entry
        // There may be multiple if batched
        data.entry.forEach(function (pageEntry) {
            var pageID = pageEntry.id;
            var timeOfEvent = pageEntry.time;

            // Iterate over each messaging event
            pageEntry.messaging.forEach(function (messagingEvent) {
                if (messagingEvent.message) {
                    receivedMessage(messagingEvent);
                }
            });
        });

        // Assume all went well.
        //
        // You must send back a 200, within 20 seconds, to let us know you've 
        // successfully received the callback. Otherwise, the request will time out.
        res.sendStatus(200);
    }
});

app.listen(process.env.PORT || 8080, function () {

    console.log('Facebook Messenger echoing bot started ...');
    doTrain();
});