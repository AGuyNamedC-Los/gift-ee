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

let userDB = DataStore.create({filename: __dirname + '/usersDB.json', autoload: true});
/*
userDB.on('update', (DataStore, result, query, update, options) => {
	console.log("hi");
});

userDB.on('load', (userDB) => {});
*/

let temp_userDB = DataStore.create({filename: __dirname + '/temp_usersDB.json', timestampData: true, autoload: true});
let options = { fieldName: 'createdAt', expireAfterSeconds: process.env.TIME_TO_DELETE };
temp_userDB.ensureIndex({ fieldName: 'createdAt', expireAfterSeconds: process.env.TIME_TO_DELETE }, function (err) {	// adding an expiration date for automatic deletion of temporary users
});

var app = express();
app.use(express.static('public'));
var urlendcodedParser = express.urlencoded({extended: true});

nunjucks.configure('templates', {
	autoescape: true,
	express: app
});

// setting path for the base template
const template = nunjucks.precompile(
  './templates/base.njk',
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
	//console.log("secret code: " + secretCode);
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
	//console.log("home: " + req.session.user.role);
    res.render('home.njk', {user: req.session.user});
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


// displays whether a user was able to successfully log in or not
app.post('/login_status', express.urlencoded({extended:true}), async function(req, res) {
	let email = req.body.email;		// get user's typed in email
	let password = req.body.password;		// get user's typed in password
	console.log("logging in... req: " + req.session.user.role);

	let tempUserFound = 0;
	// search throug the temp_userDB
	try {
		console.log("searching through temp_userDB");
		let temp_docs = await temp_userDB.find({'email': email});
		console.log("finished searching through temp_userDB");
		
		tempUserFound = temp_docs.length;
		if(tempUserFound) {
			let saltedPassword = temp_docs[0].salt + password;
			let passVerified = bcrypt.compareSync(saltedPassword, temp_docs[0].password);	// combine the user's salt and password to the hashed password
			if(passVerified) {		// user was found with correct password
				console.log("matching password and email found for temp_user");
				// begin to update the user's role
				let tempUserInfo = {
					firstname: temp_docs[0].firstName, 
					lastName: temp_docs[0].lastName, 
					username: temp_docs[0].username, 
					email: temp_docs[0].email
				};
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
					res.render("profile.njk", {user: req.session.user});
					tempUserFound = true;
					//return;
				});
			} else {	// incorrect password for temp_user
				console.log("incorrect password for temp_user");
				//res.render("error.html");
				tempUserFound = false;
				//return;
			}
		} else {	// username was not found in temp_userDB
			console.log("could not find username in temp_userDB");
			//res.render("error.html");
			tempUserFound = false;
			//return;
		}
	} catch (err) {
		console.log(`temp_userDB error ${err}`);
		res.render('login_error.html');
		return;
	}

	if(tempUserFound) {
		return;
	}

	// searching through the userDB
	try {
		console.log("searching through userDB");
		let docs = await userDB.find({'email': email});
		console.log("finished searching through userDB");
		
		let userFound = docs.length;
		if(userFound) {
			let saltedPassword = docs[0].salt + password;
			let passVerified = bcrypt.compareSync(saltedPassword, docs[0].password);	// combine the user's salt and password to the hashed password
			if (passVerified) {		// found user and correct password
				console.log("matching password and email found for user");
				let userInfo = {
					firstname: docs[0].firstName,
					 lastName: docs[0].lastName, 
					 username: docs[0].username, 
					 email: docs[0].email
				};
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
					res.render("home.njk", {user: req.session.user});
					return;
				});
			} else {		// found user but wrong password
				console.log("incorrect password for user in userDB");
				res.render('login_error.html');
				return;
			}
		} else {	// username was not found in userDB
			console.log("could not find username in userDB");
			res.render('login_error.html');
			return;
		}
	} catch (err) {
		console.log(`temp_userDB error ${err}`);
		res.render("error.html");
		return;
	}

	/*

	try {
		console.log("searching through temp_userDB");
		let temp_docs = await temp_userDB.find({'email': email});
		console.log("finished searching through temp_userDB");
		
		let tempUserFound = temp_docs.length;
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
					res.render("profile.njk", {user: req.session.user});
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
							res.render("profile.njk", {user: req.session.user});
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

	*/
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
		console.log("no @");
		res.render('sign_up_error.html', {user: req.session.user, error: ""});
		return;
	}
	
	let username = req.body.username;
	// check for username length
	if(username.length < 5 || username.length > 30) {
		res.render('sign_up_error.html', {user: req.session.user, error: ""});
		return;
	}
	// check for invalid characters for username
	for(i = 0; i < username.length; i++) {
		if(username.includes(badCharacters[i])) {
			res.render('sign_up_error.html', {user: req.session.user, error: ""});
			return;
		}
	}
	
	let firstName = req.body.firstName;
	let lastName = req.body.lastName;
	let password = req.body.password;
	
	// check for password length
	if(password.length < 5 || password.length > 30) {
		res.render('sign_up_error.html', {user: req.session.user, error: ""});
		return;
	}
	// check for invalid password characters
	for(i = 0; i < password.length; i++) {
		if(password.includes(badCharacters[i])) {
			res.render('sign_up_error.html', {user: req.session.user, error: ""});
			return;
		}
	}
	
	// check for special characters
	// check for numbers
	// check for alphabets
	// check for lowercase
	// check for uppercase

	let tempUserFound = 0;
	let duplicateUsername = false;
	/* searching through the temp_userDB */
	try {
		console.log("signing up...");
		console.log("searching through temp_userDB");
		let temp_docs = await temp_userDB.find({ $or: [{ 'email': email }, { 'username': username }] });
		//let temp_docs = await temp_userDB.find({'email': email}, {'username': username});
		tempUserFound = temp_docs.length;
		console.log("tempUserFound: " + temp_docs.length);
		if(tempUserFound) {
			for(i = 0; i < temp_docs.length; i++) {
				console.log(username + " ? " + temp_docs[i].username);
				if(temp_docs[i].username == username) { duplicateUsername = true; }
			}

			if(duplicateUsername == true) {
				console.log("Duplicate username in temp_userDB");
				res.render('sign_up_error.html', {user: req.session.user, error: "username"});
				return;
			} else {
				console.log("Duplicate email in temp_userDB");
				res.render('sign_up_error.html', {user: req.session.user, error: "email"});
				return;
			}
			
			return;
		}
	} catch (err) {
		console.log(err + "problem with temp_userdb");
		res.render('error.html', {user: req.session.user, error: ""});
		return;
	}

	if(tempUserFound) { return; }

	let userFound = 0;
	duplicateUsername = false;
	/* search through userDB */
	try{
		console.log("signing up...");
		console.log("searching through userDB");
		
		let docs = await userDB.find({ $or: [{ 'email': email }, { 'username': username }] });
		userFound = docs.length;
		console.log("user found: " + docs.length);
		if(userFound) {
			for(i = 0; i < docs.length; i++) {
				console.log(username + " ? " + docs[i].username);
				if(docs[i].username == username) { duplicateUsername = true; }
			}

			if(duplicateUsername == true) {
				console.log("Duplicate username in userDB");
				res.render('sign_up_error.html', {user: req.session.user, error: "username"});
			} else {
				console.log("Duplicate email in userDB");
				res.render('sign_up_error.html', {user: req.session.user, error: "email"});
			}
			
			return;
		}
	} catch (err) {
		console.log(err);
		res.render('sign_up_error.html', {user: req.session.user, error: ""});
		return;
	}

	if(userFound) {
		return;
	}


	/* searching through the temp_userDB */
	/*
	try {
		console.log("searching temp_userDB");
		let temp_docs = await temp_userDB.find({'email': email}, {'username': username});
		console.log("tempUserFound: " + temp_docs.length);
		let tempUserFound = temp_docs.length;
		let duplicateUsername = false;
		if(tempUserFound) {		// duplicate username or email found in temp_userDB
			if(userFound) {		// duplicate username or email found in userDB
				for(i = 0; i < temp_docs.length; i++) {
					if(temp_docs[i].username == username) { duplicateUsername = true; }
				}

				if(duplicateUsername == true) {
					console.log("Duplicate username in temp_userDB");
					res.render('sign_up_error.html', {user: req.session.user, error: "username"});
				} else {
					console.log("Duplicate email in temp_userDB");
					res.render('sign_up_error.html', {user: req.session.user, error: "email"});
				}
				
				return;
			}
			return
		} else {		// no duplicate temp user found, check the main userDB
			try {
				let userdocs = await userDB.find({'email': email}, {'username': username});
				console.log("userFound: " + userdocs.length);
				let userFound = userdocs.length;
				console.log(userdocs[0]);
				if(userFound) {		// duplicate username or email found in userDB
					duplicateUsername = false;
					for(i = 0; i < userdocs.length; i++) {
						if(userdocs[i].username == username) { duplicateUsername = true; }
					}

					if(duplicateUsername == true) {
						console.log("Duplicate username in userDB");
						res.render('sign_up_error.html', {user: req.session.user, error: "username"});
					} else {
						console.log("Duplicate email in userDB");
						res.render('sign_up_error.html', {user: req.session.user, error: "email"});
					}
					
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
	*/

	console.log("CREATING SALT");
	// creating salt
	let NUM_SIZE = process.env.NUM_SIZE;
	let rand_num1 = Math.floor(Math.random() * NUM_SIZE);
	let rand_num2 = Math.floor(Math.random() * NUM_SIZE);
	let rand_num3 = Math.floor(Math.random() * NUM_SIZE);
	let rand_num4 = Math.floor(Math.random() * NUM_SIZE);
	let salt = String(rand_num1) + String(rand_num2) + String(rand_num3) + String(rand_num4);
	console.log("salt: " + salt);

	// salting and hashing the user's password
	let hashedPassword = bcrypt.hashSync((salt + password), parseInt(process.env.nROUNDS));

	// create email verification code
	let emailCode = "";
	for(i = 0; i < 5; i++) {
		emailCode = String(emailCode) + String(Math.floor(Math.random() * NUM_SIZE));
	}

	try {
		let newTempUser = {
			"firstName": firstName,
			"lastName": lastName,
			"email": email,
			"username": username,
			"salt": salt,
			"password": hashedPassword,
			"emailConfirmation": emailCode,
			"followerTotal": "0",
			"followingTotal": "0",
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
});

app.post('/email_confirmation_status', express.urlencoded({extended:true}), async function(req, res) {
	let email = req.session.user.email;
	let emailConfirmationCode = req.body.emailConfirmation;
	let userUpgraded = false;
	
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
					"salt": temp_docs[0].salt,
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
					//res.render("gift-ee_profile.html", {user: req.session.user});
					//return;
				});
				console.log(userUpgraded);
				userUpgraded = true;
				console.log(userUpgraded);
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

	console.log("checking userupgraded statement" + userUpgraded);
	if (userUpgraded) {
		console.log("removing temp user since they have been added to main userDB");
		try {
			let temp_docs = await temp_userDB.remove({'email': email});
			res.render("home.njk", {user: req.session.user});
		} catch (err) {
			console.log(err);
			res.render('error.html');
			return;
		}
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
		res.render("gift-ee_profile.njk", {giftList: docs[0].giftListContent, user: req.session.user});
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
	let link = req.body.storeLink;
	let qty = req.body.quantity;
	let size = req.body.size;
	let price = req.body.price;
	let notes = req.body.notes;
	let email = req.session.user.email;		// get the logged in user's email
	
	let newItem = {			
		"itemName": itemName,
		"notes": notes,
		"price": price,
		"qty": qty, 
		"size": size, 
		"link": link
	};
	
	try {
		let docs = await userDB.update({"email": email}, {$addToSet: {giftListContent: newItem}}, {}, function () {});
		res.render("added_gift_success.html", {user: req.session.user});
		return;
	} catch (err) {
		console.log("error: " + err);
		res.render("error.html");
		return;
	}
});

app.post('/save_changes_status', loggedInMiddleware, express.urlencoded({extended:true}), async function(req, res) {
	let itemName = req.body.itemName;
	let link = req.body.storeLink;
	let qty = req.body.quantity;
	let size = req.body.size;
	let price = req.body.price;
	let notes = req.body.notes;
	let email = req.session.user.email;		// get the logged in user's email
	let index = req.body.itemNum;
	
	let newItem = {			
		"itemName": itemName,
		"notes": notes,
		"price": price,
		"qty": qty, 
		"size": size, 
		"link": link
	};

	let newGiftListContent;
	
	try {
		let docs = await userDB.find({'email': email});
		if(docs.length == 0) {		// no email matched
			res.render('error.html', {user: req.session.user});
			return;
		}
		newGiftListContent = JSON.parse(JSON.stringify(docs[0].giftListContent));
		newGiftListContent[index] = newItem;
		await userDB.update({'email': email }, { $set: { giftListContent: newGiftListContent } }, { multi: true }, function (err, numReplaced) {});
		res.render("added_gift_success.html", {user: req.session.user});
		return;
	} catch (err) {
		console.log("error: " + err);
		res.render("error.html");
		return;
	}
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
}); 

/*
	displays the about page
*/
app.get('/about', function (req, res) {
    res.render('about.njk', {user: req.session.user});
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
app.get('/search', async function (req, res) {
	try {
		let usernamesList = [];
		let docs = await userDB.find({});
		for(i = 0; i < docs.length; i++) {
			console.log(docs[i].username);
			usernamesList[i] = docs[i].username;
			console.log(usernamesList);
		}
		console.log(usernamesList);
		res.render('search.njk', {user: req.session.user, usernames: usernamesList});
		return;
	} catch(err) {
		console.log(err);
		res.render("error.html");
		return;
	}
});

/*
	permission: ALL
	displays a user's gift list
*/
app.post('/search_results', express.urlencoded({extended:true}), async function(req, res) {
	let username = req.body.username;
	console.log("username: " + username);
	console.log("req: " + req.session.user.role);

	try {
		let docs = await userDB.find({'username': username});

		if(docs.length == 0) {
			console.log("could not find user with that name!");
			res.render('error.html', {user: req.session.user});
			return
		} else {
			username = docs[0].username;
			let giftList = docs[0].giftListContent;
			console.log("Found user with gift list: " + giftList);
			res.render('search_result.njk', {user: req.session.user, username: username, giftList: giftList});
		}
	} catch (err) {
		console.log('error: ' + err);
		res.render('error.html', {user: req.session.user});
		return;
	}
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
