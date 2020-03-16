/*
	npm init
	npm install express
	npm install express-session
	npm install nunjucks
	npm install nedb --save
	npm install bcryptjs
	to use nunjucks-precompile go into node.js command prompt then drag templates into 
	npm install gulp -D
	npm install gulp-cli-g
	npm install gulp-nunjucks --save
	npm install hulp-nunjucks-render
*/

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const nunjucks = require('nunjucks');
const DataStore = require('nedb');
const userDB = new DataStore({filename: __dirname + '/usersDB', autoload: true});		// importing the database
userDB.loadDatabase(function (err) {
    userDB.find({}, function(err, docs) {
        console.log(err || docs);
    });
});
const bcrypt = require('bcryptjs');

var app = express();
app.use(express.static('public'));
var urlendcodedParser = express.urlencoded({extended: true});

nunjucks.configure('templates', {
	autoescape: true,
	express: app
});

// setting path for the base template
const template = nunjucks.precompile(
  './templates/base.html',
  { name: 'base' }
);

const cookieName="yummy_cookie";
app.use(session({
	secret: "This is my secret, look away!",
	resave: false,
	saveUninitialized: false,
	name: cookieName
}));

const setUpSessionMiddleware = function(req, res, next) {
	if(!req.session.user) {
		req.session.user = {role: "guest", firstName: "", lastName: "", email: "", username: ""};
	}
	next();
};
app.use(setUpSessionMiddleware);

// this middleware restricts paths to only logged in users
const loggedInMiddleware = function(req, res, next) {
	if(req.session.user.role != "user") {
		res.render("users_only.html", {user: req.session.user});
	} else {
		next();
	}
};

/* ----------------------------------------------------WEBPAGES---------------------------------------------------- */
app.get('/', function (req, res) {
	console.log("\\, ., @, /, \', \"");
    res.render('home.html', {user: req.session.user});
	return;
});

/*
	permission: guests
	displays login page
*/
app.get('/login', function (req, res) {
    res.render('login.html', {user: req.session.user});
	return;
});

/*  
	displays whether a user was able to successfully log in or not
*/
app.post('/login_status', express.urlencoded({extended:true}), function(req, res) {
	let email = req.body.email;		// get user's typed in email
	let password = req.body.password;		// get user's typed in password
	
	userDB.find({"email": email}, function (err, docs) {
		if (err) {
			console.log("something is wrong");
		} else {
			console.log("We found " + docs.length + " email that matches");
			if(docs.length == 0) {		// no email matched
				res.render('users_only.html', {user: req.session.user});
				return;
			}
			
			let verified = bcrypt.compareSync(password, docs[0].password); 
			if (!verified) {
				res.render("users_only.html", {user: req.session.user});
				return;
			}
			
			let oldInfo = req.session.user;
			req.session.regenerate(function (err) {
				if (err) {
					console.log(err);
					res.render('users_only.html', {user: req.session.user});
					return;
				}
				
				req.session.user = Object.assign(oldInfo, docs, {
					role: "user",
					firstName: docs[0]['firstName'],
					lastName: docs[0]['lastName'],
					email: docs[0]["email"],
					username: docs[0]["username"]
				});
				console.log("You've been promoted to user!");
				res.render("gift-ee_profile.html", {user: req.session.user});
				return;
			});
		}
	});
});

/*
	displays whether a user logged out properly
*/
app.post('/logout_status', express.urlencoded({extended:true}), function(req, res) {
	let email = req.session.user.email;
	
	console.log("email to find: " + email);
	
	userDB.find({"email": email}, function (err, docs) {
		if (err) {
			console.log("something is wrong");
		} else {
			console.log("We found " + docs.length + " email that matches");
			if(docs.length == 0) {		// no email matched
				res.render('error.html', {user: req.session.user});
				return;
			}
			
			let oldInfo = req.session.user;
			req.session.regenerate(function (err) {
				if (err) {
					console.log(err);
					res.render('error.html', {user: req.session.user});
					return;
				}
				
				req.session.user = Object.assign(oldInfo, docs, {
					role: "guest",
					firstName: "",
					lastName: "",
					email: "",
					username: ""
				});
				console.log("You've been demoted to a guest!");
				res.render("logout.html", {user: req.session.user});
				return;
			});
		}
	});
});

app.get('/sign-up', function (req, res) {
    res.render('sign_up.html', {user: req.session.user});
});

var badCharacters = ["/", "\\", "\'", "\"", " "];
var specialCharacters = /[ `!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]/;
app.post('/sign_up_status', express.urlencoded({extended:true}), function(req, res) {
	let email = req.body.email;
	// check for the proper @email suffix
	if(!email.includes("@")) {
		res.render("sign_up_error.html");
		return;
	}
	
	
	let username = req.body.username;
	// check for username length
		if(username.length < 5 || username.length > 30) {
		res.render("sign_up_error.html");
		return;
	}
	// check for invalid characters for username
	for(i = 0; i < username.length; i++) {
		if(username.includes(badCharacters[i])) {
			res.render("sign_up_error.html");
			return;
		}
	}
	
	let firstName = req.body.firstName;
	let lastName = req.body.lastName;
	
	let password = req.body.password;
	// check for password length
	if(password.length < 5 || password.length > 30) {
		res.render("sign_up_error.html");
		return;
	}
	// check for invalid password characters
	for(i = 0; i < password.length; i++) {
		if(password.includes(badCharacters[i])) {
			res.render("sign_up_error.html");
			return;
		}
	}
	
	// check for special characters
	// check for numbers
	// check for alphabets
	// check for lowercase
	// check for uppercase
	
	// begin to search the databse for duplicate emails or usernames
	userDB.find({$or: [{"email": email}, {"username": username}]}, function (err, docs) {
		if (err) {
			console.log("something is wrong");
			res.render("error.html", {user: req.session.user});
			return;
		} else {
			console.log("We found " + docs.length + " emails or user names that matched");
			console.log(email);
			console.log(username);
			
			// return an error if the email or username exists
			if(docs.length > 0) {
				console.log("email or username has already been taken!");
				res.render("sign_up_error.html");
				return; 
			}
			
			// if no duplications of the email or username were discovered, then create the account
			if(docs.length == 0) {
				// salt and hash password
				let hashedPassword = bcrypt.hashSync(password, process.env.nROUNDS);
				let verified = bcrypt.compareSync(password, hashedPassword);
				
				// create a new user with user inputed fields 
				let newUser = 	{
					"firstName": firstName,
					"lastName": lastName,
					"email": email,
					"username": username,
					"password": hashedPassword,
					"followerTotal": 0,
					"followingTotal": 0,
					"followerList": [],
					"followingList": [],
					"giftListContent": []
				}
				
				// add them to the user database
				userDB.insert(newUser, function(err, newDocs) {
					if (err) {
						console.log("Something went wrong when adding to the database");
						console.log(err);
					} else { console.log("Added a new user"); }
				});
				
				res.render('sign_up_success.html', {"firstName":firstName, user: req.session.user});
				return;
			} 
		}
	});
});

/*
	permissions: logged in user's
	displays a user's profile
*/
app.get('/profile', loggedInMiddleware, function (req, res) {
	let email = req.session.user.email;		// get the logged in user's email
	
	userDB.find({"email": email}, function (err, docs) {
		if (err) {
			console.log("something is wrong");
		} else {
			console.log("We found " + docs.length + " email that matches");
			if(docs.length == 0) {		// no email matched
				res.render('error.html', {user: req.session.user});
				return;
			}
			
			console.log(docs[0].giftListContent);
			res.render("gift-ee_profile.html", {giftList: docs[0].giftListContent, user: req.session.user});
			return;
		}
	});
});

/*
	gets displayed after a user has added a gift to their gift list
*/
app.post('/added_gift_status', loggedInMiddleware, express.urlencoded({extended:true}), function(req, res) {
	let itemName = req.body.itemName;
	let link = req.body.link;
	let qty = req.body.qty;
	let size = req.body.size;
	let color = req.body.color;
	let email = req.session.user.email;		// get the logged in user's email
	
	userDB.update({"email": email}, {$addToSet: {giftListContent: {"itemName": itemName, "link": link, "qty": qty, "size": size, "color": color} }}, {}, function () {
		userDB.ensureIndex({fieldName: "username", unique: true});
		res.render("added_gift_success.html", {user: req.session.user});
		return;
	});
});

/*
	gets displayed after a user has deleted an item from their gift list
*/
app.post('/deleted_gift_status', loggedInMiddleware, express.urlencoded({extended:true}), function(req, res) {
	let email = req.session.user.email;
	let itemNum = req.body.itemNum;
	// check for case of removing something out of bounds for itemNum
	console.log("item number: " + itemNum);
	
	userDB.find({"email": email}, function (err, docs) {
		if (err) {
			console.log("something is wrong");
		} else {
			console.log("We found " + docs.length + " email that matches");
			if(docs.length == 0) {		// no email matched
				res.render('error.html');
				return;
			}
			
			console.log(itemNum);	
			console.log(docs[0].giftListContent[0].itemName);
			var newGiftList = docs[0].giftListContent;
			var deletedItem = newGiftList.splice(itemNum, 1);		// removing an item from a user's gift list
			
			userDB.update({"email": email}, {$set: {giftListContent: newGiftList}}, {}, function (err, numReplaced) {
				if(err) {
					return("error.html");
				}
				console.log("removed: " + numReplaced + " item");
				console.log(deletedItem[0].itemName);
				res.render("deleted_gift_success.html", {deletedItem: deletedItem[0]});
			});
		}
	});
}); 

/*
	displays the about page
*/
app.get('/about', function (req, res) {
    res.render('about.html', {user: req.session.user});
	return;
});

/* ----------------------------------------------- FOR PRIVATE USE ONLY, SHOULD BE DELETED IN THE FUTURE ----------------------------------------------- */
app.get('/userlist', function (req, res) {
	let userList = [];
	
	userDB.find({}, function(err, docs) {		// return all items in the database
		if (err) {
			console.log("something is wrong");
			return;
		} else {
			console.log("We found " + docs.length + " users");
			for(let d of docs) {
				console.log(`Name: ${d.firstName}`);
				userList.push({"firstName": `${d.firstName}`})		// append database items to variable
			}
			res.render('user_list.html', {users: userList});		// had to change the tours.njk variable for the for-loop, compared to hw8
			return;
		}
	});
});

/* 
	allows users and guests to search for user's gift list
 */
app.get('/search', function (req, res) {
	res.render('search.html', {user: req.session.user});
	return;
});

/*
	permission: ALL
	displays a user's gift list
*/
app.post('/search_results', express.urlencoded({extended:true}), function(req, res) {
	let username = req.body.username;
	
	userDB.find({"username": username}, function (err, docs) {
		if (err) {
			console.log("something is wrong");
			if(docs.length == 0) {
				console.log("could not find a user by that name");
				res.render('error.html');
				return
			}
		} else {
			username = docs[0].username;
			var giftList = docs[0].giftListContent;
			res.render("search_result.html", {username: username, giftList: giftList});
		}
	});
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Listening on ${ PORT }`));

/*

let host = '127.15.59.37';
let port = '2323';

app.listen(port, host, function () {
    console.log("tourServer via Templates listening on IPv4: " + host + ":" + port);
});

*/
