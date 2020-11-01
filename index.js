require('dotenv').config();
const nodemailer = require('nodemailer');
const express = require('express');
const session = require('express-session');
const nunjucks = require('nunjucks');
const bcrypt = require('bcryptjs');
var hash = require('object-hash');
const DataStore = require('nedb-promises');

let userDB = DataStore.create({filename: __dirname + '/usersDB.json', autoload: true});

let temp_userDB = DataStore.create({filename: __dirname + '/temp_usersDB.json', timestampData: true, autoload: true});
let options = { fieldName: 'createdAt', expireAfterSeconds: process.env.TIME_TO_DELETE };
temp_userDB.ensureIndex({fieldName: 'createdAt', expireAfterSeconds: process.env.TIME_TO_DELETE}, function (err) {	// adding an expiration date for automatic deletion of temporary users
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
		req.session.user = { role: "guest", firstName: "", lastName: "", email: "", username: "" };
	}
	next();
};
app.use(setUpSessionMiddleware);

const loggedInMiddleware = function(req, res, next) {
	if (req.session.user.role == "guest") {
		res.render("response.njk", {user: req.session.user, title: "Users Only", link: "/", message: "Sorry, only logged in users may view this page", buttonMsg: "GO TO HOMEPAGE"});
	} else {
		next();
	}
};

const guestsOnlyMiddleware = function(req, res, next) {
	if (req.session.user.role != "guest") {
		res.render("response.njk", {user: req.session.user, title: "Guests Only", link: "/", message: "Sorry, only guests may view this page", buttonMsg: "GO TO HOMEPAGE"});
	} else {
		next();
	}
};

const usersOnlyMiddleware = function(req, res, next) {
	if (req.session.user.role != "user") {
		res.render("response.njk", {user: req.session.user, title: "Users Only", link: "/", message: "Sorry, only users may view this page", buttonMsg: "GO TO HOMEPAGE"});
	} else {
		next();
	}
};

/* ----------------------------
	helper functions
---------------------------- */
async function sendConfirmationCode(secretCode, email) {
	let message = "";
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
			html: `
			<html lang="en">
			<head>
				<style>
					#email-content {
						background-color: white;
						border: 1px solid #DFE1E6;
						max-width: 35rem;
						margin: 1rem auto;
						border-radius: 5px;
						padding: 1rem;
						text-align: center;
					}
			
					a {
						display: flex;
						width: 100%;
						max-width: 7rem;
						margin: 1rem auto;
					}
			
					#top, #bottom {
						border: 5px solid;
						width: 100%;
						max-width: 20rem;
						margin: 0 auto;
					}
			
					#top {
						padding: 1rem 0;
						max-width: 21rem;
						border-radius: 5px;
						margin-bottom: 1rem;
					}
			
					#bottom {
						padding: 5rem 0;
						margin-top: 1rem;
					}
			
					#content {
						display: flex;
						flex-direction: column;
					}
			
					p {
						text-align: center;
						padding: 0; margin:0;
						font-family: "GTWalsheim", system-ui, sans-serif;
						text-rendering: optimizelegibility;
					}
			
					#content p {
						font-size: 1.5rem;
						display: block;
						width: 50%;
						margin: 0 auto;
						min-width: 5rem;
						padding: .5rem 0;
						border: solid;
						border-radius: 5px;
						color: white;
						background-color: #0060E0;
						border: solid;
						border-radius: 5px;
						border-color: black;
					}
				</style>
			</head>
			<body>
				<main>
					<div id="email-content">
						<a href="https://gift-ee.herokuapp.com/"><img src="https://raw.githubusercontent.com/AGuyNamedC-Los/gift-ee/master/public/website_images/giftee-logo.png" alt="giftee-logo"></a>
						<div id="gift">
							<div id="top"></div>
							<div id="content">
								<p>${secretCode}</p>
							</div>
							<div id="bottom">
								<p>Above is your confirmation code!</p>
							</div>
						</div>
					</div>
				</main>
			</body>
			</html>
			`
		};

		transporter.sendMail(mailOptions, function(error, info) {
			if (error) { console.log(error); } 
			else { console.log('Email sent: ' + info.response); }
		}); 
	} catch (err) { console.log(err); }
}

function getGift(inputs) {
	let newGift = {
		"itemName": (inputs.itemName == "") ? "Gift" : inputs.itemName,
		"notes": inputs.notes,
		"price": inputs.price,
		"quantity": inputs.quantity, 
		"size": inputs.size, 
		"storeLink": inputs.storeLink
	}
	return newGift;
}

/* ----------------------------
	web pages
---------------------------- */
app.get('/', function (req, res) { res.render('home.njk', {user: req.session.user}); });

app.get('/login', guestsOnlyMiddleware, function (req, res) { res.render('login.html', {user: req.session.user}); });

app.post('/login_status', express.urlencoded({extended:true}), async function(req, res) {
	let email = req.body.email;		// get user's typed in email
	let password = req.body.password;		// get user's typed in password
	let tempUserFound = 0;

	// search throug the temp_userDB
	try {
		let docs = await temp_userDB.find({'email': email});
		
		tempUserFound = docs.length;
		if (tempUserFound) {
			let saltedPassword = docs[0].salt + password;
			let passVerified = bcrypt.compareSync(saltedPassword, docs[0].password);	// combine the user's salt and password to the hashed password
			if (passVerified) {		// user was found with correct password
				// begin to update the user's role
				let oldInfo = req.session.user;
				req.session.regenerate(function (err) {
					if (err) {
						console.log(err);
						return false;
					}
					req.session.user = Object.assign(oldInfo, {}, { role: "temp_user", firstname: docs[0].firstName, lastName: docs[0].lastName, username: docs[0].username, email: docs[0].email });
					res.render("response.njk", {user: req.session.user, title: "Login Successful", link: "/profile", message: "Successfully Logged In", buttonMsg: "GO TO HOMEPAGE"});
					tempUserFound = true;
				});
			} else {	// incorrect password for temp_user
				tempUserFound = false;
			}
		} else {	// username was not found in temp_userDB
			tempUserFound = false;
		}
	} catch (err) {
		res.render("response.njk", {user: req.session.user, title: "Error", link: "/", message: "Error: " + err, buttonMsg: "BACK TO HOMEPAGE"});
		return;
	}

	if (tempUserFound) { return; }

	// searching through the userDB
	try {
		let docs = await userDB.find({'email': email});
		let userFound = docs.length;

		if (userFound) {
			let saltedPassword = docs[0].salt + password;
			let passVerified = bcrypt.compareSync(saltedPassword, docs[0].password);	// combine the user's salt and password to the hashed password
			
			if (passVerified) {		// found user and correct password
				let oldInfo = req.session.user;
				req.session.regenerate(function (err) {
					if (err) {
						console.log(err);
						return false;
					}
					
					req.session.user = Object.assign(oldInfo, {}, { role: "user",firstname: docs[0].firstName, lastName: docs[0].lastName, username: docs[0].username, email: docs[0].email });
					res.render("response.njk", {user: req.session.user, title: "Login Successful", link: "/profile", message: "Successfully Logged In", buttonMsg: "GO TO GIFT LIST"});
				});
			} else {		// found user but wrong password
				res.render("response.njk", {user: req.session.user, title: "Login Failed", link: "/login", message: "Incorrect Username or Password", buttonMsg: "BACK TO LOGIN"});
			}
		} else {	// username was not found in userDB
			res.render("response.njk", {user: req.session.user, title: "Login Failed", link: "/login", message: "Incorrect Username or Password", buttonMsg: "BACK TO LOGIN"});
		}
	} catch (err) {
		res.render("response.njk", {user: req.session.user, title: "Error", link: "/", message: "Error: " + err, buttonMsg: "BACK TO HOMEPAGE"});
	}
});

app.post('/logout_status', express.urlencoded({extended:true}), async function(req, res) {
	req.session.regenerate(function (err) {
		if (err) {
			res.render("response.njk", {user: req.session.user, title: "Error", link: "/", message: "error: " + err, buttonMsg: "BACK TO HOME"});
			return;
		}

		req.session.user = {role: "guest", firstName: "", lastName: "", email: "", username: ""};
		res.render("response.njk", {user: req.session.user, title: "Logged Out", link: "/", message: "Successfully Logged Out", buttonMsg: "BACK TO HOME"});
	});
});

app.get('/sign-up', guestsOnlyMiddleware, function (req, res) { res.render('sign_up.html', {user: req.session.user}); });

app.post('/sign_up_status', express.urlencoded({extended:true}), async function(req, res) {
	// get form inputs
	let email = req.body.email;
	let firstName = req.body.firstName;
	let lastName = req.body.lastName;
	let username = req.body.username;
	let password = req.body.password;
	let errorMessage = "";

	// regex to test for string inputs
	let hasBadChars = /^(?=.*[`{}\\[\]:";',./-])/;
	let hasSpaces = /^[\S]+$/;
	let hasDigit = /^(?=.*\d)/;
	let hasLowercase = /^(?=.*[a-z])/;
	let hasUppercase = /^(?=.*[A-Z])/;

	// check for valid username
	let badUsername = false;

	if (username.length < 3) { errorMessage = "Username needs at least 3 characters!"; badUsername = true; }
	if (username.length > 40) { errorMessage = "Username can't exceed 30 characters!"; badUsername = true; }
	if (hasBadChars.test(username)) { errorMessage = `Username can't contain \` {} \\ [\] : " ; ' , . "`; badUsername = true; }
	else if (!hasSpaces.test(username)) { errorMessage = "Username can't contain spaces"; badUsername = true;}

	if (badUsername) {
		res.render("response.njk", {user: req.session.user, title: "Sign Up Error", link: "/sign-up", message: "The username: " + username + " is not a valid username", buttonMsg: "BACK TO SIGN UP PAGE"});
		return;
	}

	// check for valid password
	badPassword = false;

	if (password.length < 8) { errorMessage = "password needs at least 8 characters!"; badPassword = true; }
	if (password.length > 128) { errorMessage = "passwords can't exceed 128 characters!"; badPassword = true; }
	if (hasBadChars.test(password)) { errorMessage = `password can't contain \` {} \\ [\] : " ; ' , . "`; badPassword = true; }
	else if (!hasSpaces.test(password)) { errorMessage = "password can't contain spaces"; badPassword = true;}
	else if (!hasDigit.test(password)) { errorMessage = "password must contain a digit!"; badPassword = true; }
	else if (!hasLowercase.test(password)) { errorMessage = "password must contain a lowercase letter"; badPassword = true; }
	else if (!hasUppercase.test(password)) { errorMessage = "password must contain a uppercase letter"; badPassword = true; }

	if (badPassword) {
		res.render("response.njk", {user: req.session.user, title: "Sign Up Error", link: "/sign-up", message: "the password you have entered is not valid", buttonMsg: "BACK TO SIGN UP PAGE"});
		return;
	}

	let tempUserFound = 0;
	let duplicateUsername = false;
	/* searching through the temp_userDB */
	try {
		let docs = await temp_userDB.find({ $or: [{ 'email': email }, { 'username': username }] });
		//let temp_docs = await temp_userDB.find({'email': email}, {'username': username});
		tempUserFound = docs.length;
		if (tempUserFound) {
			for(i = 0; i < docs.length; i++) {
				if (docs[i].username == username) { duplicateUsername = true; }
			}

			if(duplicateUsername == true) {
				res.render("response.njk", {user: req.session.user, title: "Sign Up Error", link: "/sign-up", message: "the username: " + username + " has already been taken!", buttonMsg: "BACK TO SIGN UP PAGE"});
				return;
			} else {
				res.render("response.njk", {user: req.session.user, title: "Sign Up Error", link: "/sign-up", message: "the email: " + email + " has already been taken!", buttonMsg: "BACK TO SIGN UP PAGE"});
				return;
			}
		}
	} catch (err) {
		res.render("response.njk", {user: req.session.user, title: "Sign Up Error", link: "/sign-up", message: "Error: " + err, buttonMsg: "BACK TO SIGN UP PAGE"});
		return;
	}

	if (tempUserFound) { return; }

	let userFound = 0;
	duplicateUsername = false;

	// search through userDB 
	try {
		let docs = await userDB.find({ $or: [{ 'email': email }, { 'username': username }] });
		userFound = docs.length;
		if (userFound) {
			for(i = 0; i < docs.length; i++) {
				if(docs[i].username == username) { duplicateUsername = true; }
			}

			if (duplicateUsername == true) {	// username already exists in the userDB
				res.render("response.njk", {user: req.session.user, title: "Sign Up Error", link: "/sign-up", message: "the username: " + username + " has already been taken!", buttonMsg: "BACK TO SIGN UP PAGE"});
			} else {		// email already exists in the userDB
				res.render("response.njk", {user: req.session.user, title: "Sign Up Error", link: "/sign-up", message: "the email: " + email + " has already been taken!", buttonMsg: "BACK TO SIGN UP PAGE"});
			}
			return;
		}
	} catch (err) {
		res.render("response.njk", {user: req.session.user, title: "Sign Up Error", link: "/sign-up", message: "Error: " + err, buttonMsg: "BACK TO SIGN UP PAGE"});
		return;
	}
	// if (userFound) { console.log("USER ALREADY "); return; }

	// creating salt
	let NUM_SIZE = process.env.NUM_SIZE;
	let rand_num1 = Math.floor(Math.random() * NUM_SIZE);
	let rand_num2 = Math.floor(Math.random() * NUM_SIZE);
	let rand_num3 = Math.floor(Math.random() * NUM_SIZE);
	let rand_num4 = Math.floor(Math.random() * NUM_SIZE);
	let salt = String(rand_num1) + String(rand_num2) + String(rand_num3) + String(rand_num4);

	// salting and hashing the user's password
	let hashedPassword = bcrypt.hashSync((salt + password), parseInt(process.env.nROUNDS));

	// create email verification code
	let emailCode = "";
	for(i = 0; i < 5; i++) { emailCode = String(emailCode) + String(Math.floor(Math.random() * NUM_SIZE)); }

	let newTempUser = {
		"firstName": firstName,
		"lastName": lastName,
		"email": email,
		"username": username,
		"salt": salt,
		"password": hashedPassword,
		"emailConfirmation": emailCode,
	}

	// insert into the temp_userDB and then send the user an email confirmation code
	try {
		await temp_userDB.insert(newTempUser);
		await sendConfirmationCode(newTempUser.emailConfirmation, newTempUser.email);
		
		let oldInfo = req.session.user;
		req.session.user = Object.assign(oldInfo, newTempUser, {role: "temp_user", firstName: newTempUser.firstName, lastName: newTempUser.lastName, email: newTempUser.email, username: newTempUser.username});
		res.render('sign_up_success.njk', {user: req.session.user});
	} catch (err) {
		res.render("response.njk", {user: req.session.user, title: "Error", link: "/", message: "error: " + err, buttonMsg: "BACK TO HOME PAGE"});
	}
});

app.post('/email_confirmation_status', express.urlencoded({extended:true}), async function(req, res) {
	let email = req.session.user.email;
	let emailConfirmationCode = req.body.emailConfirmationCode;
	let userUpgraded = false;
	
	try {
		let docs = await temp_userDB.find({'email': email});
		
		if (docs[0].emailConfirmation == emailConfirmationCode) {
			let newUser = {
				"firstName": docs[0].firstName,
				"lastName": docs[0].lastName,
				"email": docs[0].email,
				"username": docs[0].username,
				"salt": docs[0].salt,
				"password": docs[0].password,
				"followerTotal": 0,
				"followingTotal": 0,
				"followerList": [],
				"followingList": [],
				"giftListContent": []
			}
			try {
				await userDB.insert(newUser);	// insert the new user into the main DB
				let oldInfo = req.session.user;

				// upgrade user
				req.session.regenerate(function (err) {
					if (err) {
						res.render("response.njk", {user: req.session.user, title: "Error", link: "/", message: "error: " + err, buttonMsg: "BACK TO HOME PAGE"});
						return;
					}
					
					req.session.user = Object.assign(oldInfo, newUser, { role: "user", firstName: newUser.firstName, lastName: newUser.lastName, email: newUser.email, username: newUser.username });
				});
				
				userUpgraded = true;
			} catch (err) {
				res.render("response.njk", {user: req.session.user, title: "Error", link: "/", message: "error: " + err, buttonMsg: "BACK TO HOME PAGE"});
				return;
			}
		} else {	// wrong email confirmation code
			res.render("response.njk", {user: req.session.user, title: "Wrong Code", link: "/", message: "Wrong Email Confirmation Code", buttonMsg: "BACK TO HOMEPAGE"});
			return;
		}
	} catch (err) {
		res.render("response.njk", {user: req.session.user, title: "Error", link: "/", message: "error: " + err, buttonMsg: "BACK TO HOME PAGE"});
		return;
	}

	if (userUpgraded) {
		try {
			await temp_userDB.remove({'email': email});
			res.render("home.njk", {user: req.session.user});
		} catch (err) {
			res.render("response.njk", {user: req.session.user, title: "Error", link: "/", message: "error: " + err, buttonMsg: "BACK TO HOME PAGE"});
		}
	}
});

app.post('/resend_confirmation_code', express.urlencoded({extended:true}), async function(req, res) {
	let email = req.session.user.email;

	try {
		let docs = await temp_userDB.find({'email': email});
		sendConfirmationCode(docs[0].emailConfirmation, email);
		res.render("response.njk", {user: req.session.user, title: "Code Re-Sent", link: "/", message: "Email confirmation code has been resent to your email address!", buttonMsg: "BACK TO HOMEPAGE"});
	} catch (err) {
		res.render("response.njk", {user: req.session.user, title: "Error", link: "/", message: "error: " + err, buttonMsg: "BACK TO HOME PAGE"});
	}
});

app.get('/profile', usersOnlyMiddleware, async function (req, res) {
	try {
		let docs = await userDB.find({'email': req.session.user.email});
		res.render("gift-ee_profile.njk", {giftList: docs[0].giftListContent, user: req.session.user});
	} catch (err) {
		res.render("response.njk", {user: req.session.user, title: "Could Not Load Profile", link: "/", message: "error: " + err, buttonMsg: "BACK TO HOME PAGE"});
	}
});

app.post('/added_gift_status', usersOnlyMiddleware, express.urlencoded({extended:true}), async function(req, res) {
	let email = req.session.user.email;		// get the logged in user's email
	
	try {
		let newItem = getGift(req.body);
		await userDB.update({"email": email}, {$addToSet: {giftListContent: newItem}}, {}, function () {});
		res.render("response.njk", {user: req.session.user, title: "Added Gift", link: "/profile", message: "Gift Added Successfully!", buttonMsg: "BACK TO GIFT LIST"});
	} catch (err) {
		res.render("response.njk", {user: req.session.user, title: "Could Not Add Gift", link: "/profile", message: "error: " + err, buttonMsg: "BACK TO GIFT LIST"});
	}
});

app.post('/save_changes_status', usersOnlyMiddleware, express.urlencoded({extended:true}), async function(req, res) {
	let email = req.session.user.email;		// get the logged in user's email
	let index = req.body.index;
	
	try {
		let docs = await userDB.find({'email': email});
		if(docs.length == 0) {		// no email matched
			res.render("response.njk", {user: req.session.user, title: "Error", link: "/", message: "Could not find user!", buttonMsg: "BACK TO HOMEPAGE"});
			return;
		}

		let newGiftListContent = JSON.parse(JSON.stringify(docs[0].giftListContent));	// get the user's current gift list
		newGiftListContent[index] = getGift(req.body);		// apply changes to the gift at the given index
		await userDB.update({'email': email }, { $set: { giftListContent: newGiftListContent } }, { multi: true }, function (err, numReplaced) {});
		res.render("response.njk", {user: req.session.user, title: "Gift Changes Saved", link: "/profile", message: "Changes Successfully Saved", buttonMsg: "BACK TO GIFT LIST"});
	} catch (err) {
		res.render("response.njk", {user: req.session.user, title: "Error", link: "/profile", message: "error: " + err, buttonMsg: "BACK TO GIFT LIST"});
	}
});

app.post('/deleted_gift_status', usersOnlyMiddleware, express.urlencoded({extended:true}), async function(req, res) {
	let email = req.session.user.email;
	// check for case of removing something out of bounds for itemNum?
	
	try {
		let docs = await userDB.find({'email': email});
		if (docs.length == 0) {
			res.render("response.njk", {user: req.session.user, title: "Error", link: "/", message: "Could not find user!", buttonMsg: "BACK TO HOMEPAGE"});
			return;	
		} else {
			var newGiftList = docs[0].giftListContent;
			var deletedItem = newGiftList.splice(req.body.index, 1);		// removing an item from a user's gift list
		}
	} catch (err) {
		res.render("response.njk", {user: req.session.user, title: "Error", link: "/profile", message: "error: " + err, buttonMsg: "BACK TO GIFT LIST"});
		return;
	}
	
	try {
		let docs = await userDB.update({"email": email}, {$set: {giftListContent: newGiftList}}, {}, function (err, numReplaced) {});
		res.render("response.njk", {user: req.session.user, title: "Gift Deleted", link: "/profile", message: "Gift Successfully Deleted!", buttonMsg: "BACK TO GIFT LIST"});
	} catch (err) {
		res.render("response.njk", {user: req.session.user, title: "Error", link: "/profile", message: "error: " + err, buttonMsg: "BACK TO GIFT LIST"});
	}
}); 

app.get('/about', function (req, res) { res.render('about.njk', {user: req.session.user}); });

app.get('/search', async function (req, res) {
	try {
		let usernamesList = [];
		let docs = await userDB.find({});

		for (i = 0; i < docs.length; i++) { usernamesList[i] = docs[i].username; }
		res.render('search.njk', {user: req.session.user, usernames: usernamesList});
	} catch (err) {
		res.render("response.njk", {user: req.session.user, title: "Error", link: "/", message: "error: " + err, buttonMsg: "BACK TO HOME"});
	}
});

app.post('/search_results', express.urlencoded({extended:true}), async function(req, res) {
	try {
		let docs = await userDB.find({'username': req.body.username});

		if(docs.length == 0) {
			res.render("response.njk", {user: req.session.user, title: "User Not Found", link: "/search", message: "Could Not Find A User With That Name", buttonMsg: "BACK TO SEARCH"});
		} else {
			res.render('search_result.njk', {user: req.session.user, username: docs[0].username, giftList: docs[0].giftListContent});
		}
	} catch (err) {
		res.render("response.njk", {user: req.session.user, title: "Error", link: "/profile", message: "error: " + err, buttonMsg: "BACK TO GIFT LIST"});
	}
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Listening on ${ PORT }`));


// let host = '127.15.59.37';
// let port = '2323';

// app.listen(port, host, function () {
//     console.log("Server listening on IPv4: " + host + ":" + port);
// });