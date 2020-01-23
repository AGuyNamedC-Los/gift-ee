/* 
	npm install nedb --save
	npm install --save nedb-promises 
*/

const DataStore = require('nedb-promises');
const db = DataStore.create(__dirname + '/usersDB');
const users = require('./usersDB.json');

async function initialize() { // so I can await!
    try {
        let numRemoved = await db.remove({}, {multi: true});
        console.log(`Cleanup, removed ${numRemoved} users`);
        let newDocs = await db.insert(users);
        console.log(`Added ${newDocs.length} users`);
    } catch (err) {
        console.log(`Database error: ${err}`);
    }
}

initialize(); // don't forget to run the async function