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
const nodemailer = require('nodemailer');
const express = require('express');
const session = require('express-session');
const nunjucks = require('nunjucks');
const bcrypt = require('bcryptjs');
var hash = require('object-hash');

const DataStore = require('nedb-promises');
async function loadDatabases() {
	
}
let userDB = DataStore.create({filename: __dirname + '/usersDB', autoload: true});
userDB.on('update', (DataStore, result, query, update, options) => {
	console.log("hi");
});
userDB.on('load', (userDB) => {
    console.log("hi");// this event doesn't have a result
});
let temp_userDB = DataStore.create({filename: __dirname + '/temp_usersDB', timestampData: true, autoload: true});
let options = { fieldName: 'createdAt', expireAfterSeconds: 60 };
temp_userDB.ensureIndex({ fieldName: 'createdAt', expireAfterSeconds: 60 }, function (err) {	// adding an expiration date for automatic deletion of items
});
/*
temp_userDB.load(function (err) {
    temp_userDB.find({}, function(err, docs) {
        console.log(err || docs);
    });
});
*/

/*
const DataStore = require('nedb');
// creating and loading in the usersDB
const userDB = new DataStore({filename: __dirname + '/usersDB', autoload: true});		
userDB.loadDatabase(function (err) {
    userDB.find({}, function(err, docs) {
        console.log(err || docs);
    });
});

// creating and loading the the temp_usersDB
const temp_userDB = new DataStore({filename: __dirname + '/temp_usersDB', timestampData: true, autoload: true});		// adding a time stamp to each insertion
userDB.loadDatabase(function (err) {
    userDB.find({}, function(err, docs) {
        console.log(err || docs);
    });
});
temp_userDB.ensureIndex({ fieldName: 'createdAt', expireAfterSeconds: 60 }, function (err) {	// adding an expiration date for automatic deletion of items
});

*/

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

// restricts paths to only logged in users
const loggedInMiddleware = function(req, res, next) {
	if(req.session.user.role == "guest") {
		res.render("users_only.html", {user: req.session.user});
	} else {
		next();
	}
};

const guestsOnlyMiddleware = function(req, res, next) {
	if(req.session.user.role != "guest") {
		res.render("users_only.html", {user: req.session.user});
	} else {
		next();
	}
};

const usersOnlyMiddleware = function(req, res, next) {
	if(req.session.user.role != "user") {
		res.render("users_only.html", {user: req.session.user});
	} else {
		next();
	}
};

const tempUsersOnlyMiddleware = function(req, res, next) {
	if(req.session.user.role != "temp_user") {
		res.render("users_only.html", {user: req.session.user});
	} else {
		next();
	}
};

const guestsAndTempUsersOnly = function(req, res, next) {
	if(req.session.user.role == "user") {
		console.log("users not allowed to login again!");
		res.render("users_only.html", {user: req.session.user});
	} else {
		next();
	}
};


async function sendConfirmationCode(secretCode, email) {
	console.log("secret code: " + secretCode);
	try {
		let transporter = nodemailer.createTransport({
			service: 'gmail',
			auth: {
				user: process.env.GMAIL_EMAIL,
				pass: process.env.GMAIL_PASSWORD
			}
		});
		let mailOptions = {
			from: '"Gift-ee" <gifteebysuperseed@gmail.com>',	// sender address
			to: email,		// list of receivers
			subject: 'Gift-ee confirmation code!',	// subject line
			text: secretCode,	// plain text body
			html: `<h1>Above is your confirmation code, please re-type that into your gift-ee account to be deemed an official user! ${secretCode}</h1>`	// html body
		};

		transporter.sendMail(mailOptions, function(error, info){
			if (error) {
			console.log(error);
			} else {
			console.log('Email sent: ' + info.response);
			}
		}); 
	} catch (err) {
		console.log(err);
	}

}

/* ----------------------------------------------------WEBPAGES---------------------------------------------------- */
app.get('/', function (req, res) {
	console.log("home: " + req.session.user.role);
    res.render('home.html', {user: req.session.user});
	return;
});

/*
	permission: guests
	displays login page
*/
app.get('/login', guestsOnlyMiddleware, function (req, res) {
    res.render('login.html', {user: req.session.user});
	return;
});

/*  
	displays whether a user was able to successfully log in or not
*/
app.post('/login_status', express.urlencoded({extended:true}), async function(req, res) {
	let email = req.body.email;		// get user's typed in email
	let password = req.body.password;		// get user's typed in password
	console.log("logging in... req: " + req.session.user.role);
	
	try {
		console.log("searching through temp_userDB");
		let temp_docs = await temp_userDB.find({'email': email});
		console.log("finished searching through temp_userDB");
		
		let tempUserFound = await temp_docs.length;
		if(tempUserFound) {		// searching through temp_userDB
			let passVerified = bcrypt.compareSync(password, temp_docs[0].password);
			if (passVerified) {		// found temp_user and correct password
				console.log("matching password and email found for temp_user");
				let tempUserInfo = {firstname: temp_docs[0].firstName, lastName: temp_docs[0].lastName, username: temp_docs[0].username, email: temp_docs[0].email};
				let oldInfo = req.session.user;
				req.session.regenerate(function (err) {
					if (err) {
						console.log(err);
						return false;
					}
					
					req.session.user = Object.assign(oldInfo, tempUserInfo, {
						role: "temp_user",
						firstName: tempUserInfo.firstName,
						lastName: tempUserInfo.lastName,
						email: tempUserInfo.email,
						username: tempUserInfo.username
					});
					console.log("user upgraded to " + req.session.user.role);
					res.render("gift-ee_profile.html", {user: req.session.user});
					return;
				});
			} else {		// found temp_user but wrong password
				console.log("password incorrect in temp_user");
				res.render("error.html");
				return;
			}
		} else {		// searching through userDB
			try {
				console.log("searching through userDB");
				let docs = await userDB.find({'email': email});
				console.log("finished searching through userDB");
				
				let userFound = docs.length;
				if(userFound) {
					let passVerified = bcrypt.compareSync(password, docs[0].password);
					if (passVerified) {		// found user and correct password
						console.log("matching password and email found for user");
						let userInfo = {firstname: docs[0].firstName, lastName: docs[0].lastName, username: docs[0].username, email: docs[0].email};
						let oldInfo = req.session.user;
						req.session.regenerate(function (err) {
							if (err) {
								console.log(err);
								return false;
							}
							
							req.session.user = Object.assign(oldInfo, userInfo, {
								role: "user",
								firstName: userInfo.firstName,
								lastName: userInfo.lastName,
								email: userInfo.email,
								username: userInfo.username
							});
							console.log("user upgraded to " + req.session.user.role);
							res.render("gift-ee_profile.html", {user: req.session.user});
							return;
						});
					} else {		// found user but wrong password
						console.log("incorrect password for user in userDB");
						res.render("error.html");
						return;
					}
				} else {
					console.log("could not find user email at all");
					res.render("error.html");
					return;
				}
			} catch (err) {
				console.log(`userDB error ${err}`);
				res.render("error.html");
				return;
			}
		}
	} catch (err) {
		console.log(`temp_userDB error ${err}`);
		res.render("error.html");
		return;
	}
});

/*
	displays whether a user logged out properly
*/
app.post('/logout_status', express.urlencoded({extended:true}), async function(req, res) {
	let email = req.session.user.email;
	let oldInfo = req.session.user;
	req.session.regenerate(function (err) {
		if (err) {
			console.log(err);
			res.render('error.html', {user: req.session.user});
			return;
		}
		
		req.session.user = {role: "guest", firstName: "", lastName: "", email: "", username: ""};
		console.log("user upgraded to " + req.session.user.role);
		res.render("logout.html", {user: req.session.user});
		return;
	});
	
	/*
	console.log("logging out...");
	console.log("searching through temp_userDB");
	try {
		let temp_docs = await temp_userDB.find({'email': email});
		
		if(temp_docs.length == 0) {
			console.log("could not find user in temp_userDB");
		} else {
			console.log("found user in temp_userDB");
			req.session.user = Object.assign(oldInfo, temp_docs, {
				role: "guest",
				firstName: "",
				lastName: "",
				email: "",
				username: ""
			});
			
			res.render("logout.html", {user: req.session.user});
			return;
		}
	} catch (err) {
		console.log("error: " + err);
		res.render('error.html');
		return;
	}
	
	console.log("searching through userDB");
	try {
		let docs = await userDB.find({'email': email});
		
		if(docs.length == 0) {
			console.log("could not find user in userDB");
			res.render("logout.html", {user: req.session.user});
			return
		} else {
			console.log("found user in userDB");
			req.session.user = Object.assign(oldInfo, temp_docs, {
				role: "guest",
				firstName: "",
				lastName: "",
				email: "",
				username: ""
			});
			res.render("logout.html", {user: req.session.user});
			return;
		}
	} catch (err) {
		console.log("error: " + err);
		res.render('error.html');
		return;
	}
	*/
});

app.get('/sign-up', guestsOnlyMiddleware, function (req, res) {
	res.render('sign_up.html', {user: req.session.user});
	return;
});

app.post('/sign_up_status', express.urlencoded({extended:true}), async function(req, res) {
	let email = req.body.email;
	var badCharacters = ["/", "\\", "\'", "\"", " "];
	var specialCharacters = /[ `!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]/;
	
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
	
	
	try {
		console.log("searching temp_userDB");
		let temp_docs = await temp_userDB.find({'email': email}, {'username': username});
		console.log("tempUserFound: " + temp_docs.length);
		let tempUserFound = temp_docs.length;
		if(tempUserFound) {		// duplicate username or email found in temp_userDB
			res.render('sign_up_error.html', {user: req.session.user});
			return
		} else {		// no duplicate temp user found, check the main userDB
			try {
				let userdocs = await userDB.find({'email': email}, {'username': username});
				console.log("userFound: " + userdocs.length);
				let userFound = userdocs.length;
				console.log(userdocs[0]);
				if(userFound) {		// duplicate username or email found in userDB
					res.render('sign_up_error.html', {user: req.session.user});
					return;
				}
			} catch (err) {
				console.log(err);
				res.render('error.html', {user: req.session.user});
				return;
			}
			
		}
	} catch (err) {
		res.render('error.html', {user: req.session.user});
		return;
	}
	
	let hashedPassword = bcrypt.hashSync(password, parseInt(process.env.nROUNDS));
	try {
		let newTempUser = 	{
			"firstName": firstName,
			"lastName": lastName,
			"email": email,
			"username": username,
			"password": hashedPassword,
			"emailConfirmation": hash(email+username),
			"followerTotal": 0,
			"followingTotal": 0,
			"followerList": [],
			"followingList": [],
			"giftListContent": []
		}
		await temp_userDB.insert(newTempUser);
		console.log("sending mail");
		let result = await sendConfirmationCode(newTempUser.emailConfirmation, newTempUser.email);
		console.log("back from sending mail");
		
		let oldInfo = req.session.user;
		req.session.user = Object.assign(oldInfo, newTempUser, {
			role: "temp_user",
			firstName: newTempUser.firstName,
			lastName: newTempUser.lastName,
			email: newTempUser.email,
			username: newTempUser.username
		});
		res.render('sign_up_success.html', {user: req.session.user});
		return;
	} catch (err) {
		console.log("error: " + err);
		res.render('error.html', {user: req.session.user});
		return;
	}
	
	/*
	// find duplicate emails or usernames in the temp_userDB
	temp_userDB.find({$or: [{"email": email}, {"username": username}]}, function (err, temp_docs) {
		if (err) {
			console.log("something is wrong");
			res.render("error.html", {user: req.session.user});
			return;
		}
		
		if(temp_docs.length > 0) {	// return a signup error if the email or username exists
			res.render("sign_up_error.html");
			return; 
		} else {	// check the main userDB to see if there are duplicate emails or usernames
			userDB.find({$or: [{"email": email}, {"username": username}]}, function (err, docs) {
				if (err) {
					console.log("something is wrong");
					res.render("error.html", {user: req.session.user});
					return;
				}
				
				// return an error if the email or username exists
				if(docs.length > 0) {
					console.log("email or username has already been taken!");
					res.render("sign_up_error.html");
					return; 
				}
			});
		}
		
		// if no duplications of the email or username were discovered in both DBs, then create the temporary account
		if(temp_docs.length == 0) {
			// salt and hash password
			let hashedPassword = bcrypt.hashSync(password, parseInt(process.env.nROUNDS));
			let verified = bcrypt.compareSync(password, hashedPassword);
			
			// create a new user with user inputed fields 
			let newUser = 	{
				"firstName": firstName,
				"lastName": lastName,
				"email": email,
				"username": username,
				"password": hashedPassword,
				"emailConfirmation": hash(email+username),
				"followerTotal": 0,
				"followingTotal": 0,
				"followerList": [],
				"followingList": [],
				"giftListContent": []
			}
			
			temp_userDB.insert(newUser, function(err, newDocs) {
				if (err) {
					console.log("Something went wrong when adding to the database");
					console.log(err);
				} else {
					console.log("Added a new temporary user"); 
				}
			});
			
			res.render('sign_up_success.html', {"firstName":firstName, user: req.session.user});
			return;
		}
	});
	
	
	/* POTENTIALLY DELETE THIS SECTION OF CODE BELOW
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
				let hashedPassword = bcrypt.hashSync(password, parseInt(process.env.nROUNDS));
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
				
				userDB.insert(newUser, function(err, newDocs) {
					if (err) {
						console.log("Something went wrong when adding to the database");
						console.log(err);
					} else {
						
						console.log("Added a new user"); 
					}
				});
				
				res.render('sign_up_success.html', {"firstName":firstName, user: req.session.user});
				return;
			} 
		}
	});
	
	
	
	*/
});

app.post('/email_confirmation_status', express.urlencoded({extended:true}), async function(req, res) {
	let email = req.session.user.email;
	let emailConfirmationCode = req.body.emailConfirmation;
	
	try {
		console.log("searching for temp_user's email confirmation code in temp_userDB");
		let temp_docs = await temp_userDB.find({'email': email});
		console.log("finished searching through temp_userDB");
		
		if(temp_docs[0].emailConfirmation == emailConfirmationCode) {
			console.log("email confirmation confirmed!");
			console.log("promoting to user");
			try {
				console.log("adding to user DB");
				let newUser = {
					"firstName": temp_docs[0].firstName,
					"lastName": temp_docs[0].lastName,
					"email": temp_docs[0].email,
					"username": temp_docs[0].username,
					"password": temp_docs[0].password,
					"followerTotal": 0,
					"followingTotal": 0,
					"followerList": [],
					"followingList": [],
					"giftListContent": []
				}
				let docs = await userDB.insert(newUser);
				console.log(`added new user: ${newUser}`);
				
				let oldInfo = req.session.user;
				req.session.regenerate(function (err) {
					if (err) {
						console.log(err);
						res.render('error.html');
						return;
					}
					
					req.session.user = Object.assign(oldInfo, newUser, {
						role: "user",
						firstName: newUser.firstName,
						lastName: newUser.lastName,
						email: newUser.email,
						username: newUser.username
					});
					console.log("user upgraded to " + req.session.user.role);
					res.render("gift-ee_profile.html", {user: req.session.user});
					return;
				});
			} catch (err) {
				console.log(err);
				res.render('error.html');
				return;
			}
		} else {
			console.log("wrong email confirmation code");
			res.render('error.html');
			return;
		}
	} catch (err) {
		console.log(err);
		res.render('error.html');
		return;
	}
});

/*
	permissions: logged in user's
	displays a user's profile
*/
app.get('/profile', loggedInMiddleware, async function (req, res) {
	let email = req.session.user.email;		// get the logged in user's email
	
	try {
		let docs = await userDB.find({'email': email});
		console.log("We found " + docs.length + " email that matches");
		
		if(docs.length == 0) {		// no email matched
			res.render('error.html', {user: req.session.user});
			return;
		}
			
		console.log(docs[0].giftListContent);
		res.render("gift-ee_profile.html", {giftList: docs[0].giftListContent, user: req.session.user});
		return;
	} catch (err) {
		console.log("error");
		res.render('error.html');
		return;
	}
});

/*
	gets displayed after a user has added a gift to their gift list
*/
app.post('/added_gift_status', loggedInMiddleware, express.urlencoded({extended:true}), async function(req, res) {
	let itemName = req.body.itemName;
	let link = req.body.link;
	let qty = req.body.qty;
	let size = req.body.size;
	let color = req.body.color;
	let email = req.session.user.email;		// get the logged in user's email
	
	let newItem = {			
		"itemName": itemName,
		"link": link, 
		"qty": qty, 
		"size": size, 
		"color": color
	};
	
	try {
		let docs = await userDB.update({"email": email}, {$addToSet: {giftListContent: newItem }}, {}, function () {});
		res.render("added_gift_success.html", {user: req.session.user});
		return;
	} catch (err) {
		console.log("error: " + err);
		res.render("error.html");
		return;
	}
	
	/*
	userDB.update({"email": email}, {$addToSet: {giftListContent: {"itemName": itemName, "link": link, "qty": qty, "size": size, "color": color} }}, {}, function () {
		userDB.ensureIndex({fieldName: "username", unique: true});
		res.render("added_gift_success.html", {user: req.session.user});
		return;
	});
	*/
});

/*
	gets displayed after a user has deleted an item from their gift list
*/
app.post('/deleted_gift_status', loggedInMiddleware, express.urlencoded({extended:true}), async function(req, res) {
	let email = req.session.user.email;
	let itemNum = req.body.itemNum;
	// check for case of removing something out of bounds for itemNum
	console.log("item number: " + itemNum);
	
	try {
		let docs = await userDB.find({'email': email});
		if (docs.length == 0) {
			console.log("error: " + err);
			res.render("error.html");
			return;	
		} else {
			console.log(itemNum);
			console.log(docs[0].giftListContent[0].itemName);
			var newGiftList = docs[0].giftListContent;
			var deletedItem = newGiftList.splice(itemNum, 1);		// removing an item from a user's gift list
		}
	} catch (err) {
		console.log("error: " + err);
		res.render("error.html");
		return;
	}
	
	try {
		let docs = await userDB.update({"email": email}, {$set: {giftListContent: newGiftList}}, {}, function (err, numReplaced) {});
		console.log(deletedItem[0].itemName);
		res.render("deleted_gift_success.html", {deletedItem: deletedItem[0]});
		
	} catch (err) {
		console.log("error: " + err);
		res.render("error.html");
		return;
	}
	
	/*
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
	
	*/
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
