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
const database = require('nedb');
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
)

const cookieName="yummy_cookie";
app.use(session({
	secret: "This is my secret, look away!",
	resave: false,
	saveUninitialized: false,
	name: cookieName
}))

/* ----------------------------------------------------WEBPAGES---------------------------------------------------- */
app.get('/', function (req, res) {
    res.render('home.html');
});

app.get('/login', function (req, res) {
    res.render('login.html');
});

app.get('/sign-up', function (req, res) {
    res.render('sign_up.html');
});

app.get('/profile', function (req, res) {
    res.render('gift-ee_profile.html');
});

app.get('/about', function (req, res) {
    res.render('about.html');
});

let host = '127.15.59.37';
let port = '2323';

app.listen(port, host, function () {
    console.log("tourServer via Templates listening on IPv4: " + host + ":" + port);
});
