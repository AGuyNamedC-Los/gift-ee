require('dotenv').config();
const express = require('express');
const session = require('express-session');
const nunjucks = require('nunjucks');
const bcrypt = require('bcryptjs');
var hash = require('object-hash');
const DataStore = require('nedb-promises');

var userDB = DataStore.create({filename: __dirname + '/usersDB.json', timestampData: true, autoload: true});
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
	const sgMail = require('@sendgrid/mail');
	sgMail.setApiKey(process.env.SENDGRID_API_KEY);
	
	const msg = {
	  to: email, // Change to your recipient
	  from: process.env.GMAIL_EMAIL, // Change to your verified sender
	  subject: 'Welcome to Giftee! Confirm Your Email',
	  text: `Here is your confirmation code: ${secretCode}`,
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
	}
	
	sgMail
	  .send(msg)
	  .then(() => {
		console.log('Email sent')
	  })
	  .catch((error) => {
		console.error(error)
	  })
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
app.get('/', function (req, res) { console.log(req.params.name); res.render('home.njk', {user: req.session.user}); });

app.get('/login', guestsOnlyMiddleware, function (req, res) { res.render('login.html', {user: req.session.user}); });

app.post('/login_status', express.urlencoded({extended:true}), async function(req, res) {
    // remove expired temp users
    let expiredUsers = await userDB.find({'role': "temp_user"});
    let currTime = Date.now();
    let usersRemoved = 0;
    for (i = 0; i < expiredUsers.length; i++) {
        let ageInSeconds = Math.floor(currTime - expiredUsers[0].createdAt)/1000;
        if (ageInSeconds >= process.env.TIME_TO_DELETE) {
            await userDB.remove({'email': expiredUsers[i].email});
            usersRemoved++;
        }
    }

	let email = req.body.email;		// get user's typed in email
	let password = req.body.password;		// get user's typed in password

    // search through user DB
    try {
        let user = await userDB.find({'email': email})
        if (user.length == 1) {
            let saltedPassword = user[0].salt + password;
            passVerified = bcrypt.compareSync(saltedPassword, user[0].password);	// combine the user's salt and password to the hashed password
    
            if (passVerified) {		// found user and correct password
                req.session.regenerate(async function (err) {
                    if (err) {
                        console.log(err);
                        return false;
                    }
                    
                    req.session.user = {role: user[0].role, firstname: user[0].firstName, lastName: user[0].lastName, username: user[0].username, email: user[0].email};
                    res.render("response.njk", {user: req.session.user, title: "Login Successful", link: "/profile", message: "Successfully Logged In", buttonMsg: "GO TO GIFT LIST"});
                });
            } else {    // user found but incorrect password
                res.render("response.njk", {user: req.session.user, title: "Login Error", link: "/login", message: "Incorrect email or password", buttonMsg: "BACK TO LOGIN"});
            }
        } else {    // user not found
            res.render("response.njk", {user: req.session.user, title: "Login Error", link: "/login", message: "Incorrect email or password", buttonMsg: "BACK TO LOGIN"});
        }
    } catch (err) {
        res.render("response.njk", {user: req.session.user, title: "Error", link: "/", message: "error: " + err, buttonMsg: "BACK TO HOME PAGE"});
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
    // remove expired temp users
    let expiredUsers = await userDB.find({'role': "temp_user"});
    let currTime = Date.now();
    let usersRemoved = 0;
    for (i = 0; i < expiredUsers.length; i++) {
        let ageInSeconds = Math.floor(currTime - expiredUsers[0].createdAt)/1000;
        if (ageInSeconds >= process.env.TIME_TO_DELETE) {
            await userDB.remove({'email': expiredUsers[i].email});
            usersRemoved++;
        }
    }

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
		res.render("response.njk", {user: req.session.user, title: "Sign Up Error", link: "/sign-up", message: errorMessage, buttonMsg: "BACK TO SIGN UP PAGE"});
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
		res.render("response.njk", {user: req.session.user, title: "Sign Up Error", link: "/sign-up", message: errorMessage, buttonMsg: "BACK TO SIGN UP PAGE"});
		return;
	}

	let duplicateUsername = false;

	// search through userDB 
	try {
		let docs = await userDB.find({$or: [{'email': email}, {'username': username}]});
		if (docs.length == 1) {     // duplicate email or username was found
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

    // creating salt for the password hashing
    let salt = "";
    for (i = 0; i < 4; i++) {
        salt += String(Math.floor(Math.random() * process.env.NUM_SIZE));
    }

	// salting and hashing the user's password
	let hashedPassword = bcrypt.hashSync((salt + password), parseInt(process.env.nROUNDS));

	// create email verification code
	let emailCode = "";
	for(i = 0; i < 5; i++) {
        emailCode +=  String(Math.floor(Math.random() * process.env.NUM_SIZE));
    }

	let newUser = {
        "role": "temp_user",
		"firstName": firstName,
		"lastName": lastName,
		"email": email,
		"username": username,
		"salt": salt,
		"password": hashedPassword,
        "emailConfirmation": emailCode,
        "followerTotal": 0,
        "followingTotal": 0,
        "followerList": [],
        "followingList": [],
        "giftListContent": []
	}

	// insert into the userDB and then send the user an email confirmation code to their email
	try {
		await userDB.insert(newUser);
		await sendConfirmationCode(newUser.emailConfirmation, newUser.email);

		req.session.user = {role: "temp_user", firstName: newUser.firstName, lastName: newUser.lastName, email: newUser.email, username: newUser.username};
		res.render('sign_up_success.njk', {user: req.session.user});
	} catch (err) {
		res.render("response.njk", {user: req.session.user, title: "Error", link: "/", message: "error: " + err, buttonMsg: "BACK TO HOME PAGE"});
	}
});

app.post('/email_confirmation_status', express.urlencoded({extended:true}), async function(req, res) {
	let email = req.session.user.email;
	let emailConfirmationCode = req.body.emailConfirmationCode;

	try {
        let docs = await userDB.find({'email': email});
		
		if (docs[0].emailConfirmation == emailConfirmationCode) {   // matching email confirmation code
            await userDB.update({'email': email}, {$set: {'role': "user"}}, {multi: true}, function (err, numReplaced) {});     // upgrade the user's role to "user"
            await userDB.update({'email': email}, {$unset: {emailConfirmation: true}}, {}, function () {});     // remove the email confirmation code field

            // upgrade user
            req.session.regenerate(function (err) {
                if (err) {
                    res.render("response.njk", {user: req.session.user, title: "Error", link: "/", message: "error: " + err, buttonMsg: "BACK TO HOME PAGE"});
                    return;
                }
                
                req.session.user = { role: "user", firstName: docs[0].firstName, lastName: docs[0].lastName, email: docs[0].email, username: docs[0].username};
                res.render("response.njk", {user: req.session.user, title: "Email Confirmed", link: "/profile", message: "Your profile is now complete", buttonMsg: "GO TO GIFTLIST"});
            });
		} else {	// wrong email confirmation code
			res.render("response.njk", {user: req.session.user, title: "Wrong Code", link: "/", message: "Wrong Email Confirmation Code", buttonMsg: "BACK TO HOMEPAGE"});
		}
	} catch (err) {
		res.render("response.njk", {user: req.session.user, title: "Error", link: "/", message: "error: " + err, buttonMsg: "BACK TO HOME PAGE"});
	}
});

app.post('/resend_confirmation_code', express.urlencoded({extended:true}), async function(req, res) {
	let email = req.session.user.email;

	try {
		let docs = await userDB.find({'email': email});
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
		await userDB.update({"email": email}, {$set: {giftListContent: newGiftList}}, {}, function (err, numReplaced) {});
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

		for (i = 0; i < docs.length; i++) {usernamesList[i] = docs[i].username;}
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

app.get('giftList',  usersOnlyMiddleware, express.urlencoded({extended:true}), async function(req, res) {
	let docs = await userDB.find({'email': req.session.user.email});
	res.send(docs[0].giftListContent);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Listening on ${ PORT }`));