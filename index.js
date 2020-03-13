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
    res.render('home.html', {user: req.session.user});
});

app.get('/login', function (req, res) {
    res.render('login.html', {user: req.session.user});
});

app.post('/login_status', express.urlencoded({extended:true}), function(req, res) {
	let email = req.body.email;
	let password = req.body.password;
	
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
			
			/*
			let verified = bcrypt.compareSync(password, docs[0].password); 
			if (!verified) {
				res.render("error.html", {user: req.session.user});
				return;
			}
			*/
			
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

app.post('/sign_up_status', express.urlencoded({extended:true}), function(req, res) {
	let email = req.body.email;
	let username = req.body.username;
	if(username.length < 5) {
		res.render("sign_up_error.html");
		return;
	}
	let firstName = req.body.firstName;
	let lastName = req.body.lastName;
	let password = req.body.password;
	
	// checking for invalid characters for a password
	let invalidPassword = password.includes("/");
	if (invalidPassword) {
		res.render("sign_up_error.html", {user: req.session.user});
		return;
	}
	invalidPassword = password.includes("\\");		// checking for the [\] character
	if (invalidPassword) {
		res.render("sign_up_error.html", {user: req.session.user});
		return;
	}
	
	userDB.find({$or: [{"email": email}, {"username": username}]}, function (err, docs) {
		if (err) {
			console.log("something is wrong");
			res.render("error.html", {user: req.session.user});
			return;
		} else {
			console.log("We found " + docs.length + " emails or user names that matched");
			console.log(email);
			console.log(username);
			if(docs.length == 0) {
				// salt and hash password
				let nRounds = 11;
				let hashedPassword = bcrypt.hashSync(password, nRounds);
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
			} else {
				console.log("email or username has already been taken!");
				res.render('users_only.html');
				return;
			}
		}
	});
});

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

app.get('/about', function (req, res) {
    res.render('about.html', {user: req.session.user});
});


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

app.get('/search', function (req, res) {
	res.render('search.html');
	return;
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
