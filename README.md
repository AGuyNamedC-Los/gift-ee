# NOTE
This version of giftee is now depricated, I completely redid the file structure and code as well as implemented knex which uses sqlite3 and postgreSQL for databases which is actually compatable with heroku. If you would like to see the current working version of giftee please click this [link](https://github.com/AGuyNamedC-Los/giftee)

# Giftee
A social media-esque that allows you to manage a gift list that can be comprised of multiple items from other online stores. This gift list can also be viewed by other people who search up your username

# Motivation

I thought it would be a lot simpler to have one place to see a person's gift list so that I could buy them something for the holidays. As well as manage my own gift list instead of relying on multiple different websites

# Technological Tools Used

- Javascript
- Nunjucks
- Express
- Heroku
- HTML5
- CSS3

# Github Code Navigation

## Road Map

- ~~finish the home page demo gift list functionality~~
    - ~~add the delete button~~
    - ~~add the apply button~~
    - ~~add links to the footer of the page~~
        - ~~maybe add icons instead of text or both~~
- ~~finish css for the homepage~~
    - make a better footer
- ~~redo the login page~~
- ~~redo the sign up page~~
- ~~redo the profile page~~
- ~~fix the email confirmation code not being sent~~
- ~~fix the email confirmation code not being sent from heroku~~
- ~~added appropriate response pages~~
- ~~redo css for search page~~
- ~~make the email confirmation look prettier~~
- ~~add a "resend email confirmation code" button~~
- ~~clean up backend code~~
    - ~~maybe use one database instead of two~~
- In the case that I need to store a HUGE amount of users and information the database might need to be rewritten again, therefore it might be best to...
    - create a new file for each user with their gift list instead of having all the information in one database
- create a profile settings functionality
    - change username
    - change email
    - add/change a profile picture
    - change password
- add a privacy option for users
- implement a friends/followers list
    - ping users in the friends list when someone has bought an item from your gift list
