var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var flash = require('connect-flash');
var session = require('express-session');
var fileupload = require('express-fileupload');

const { Pool } = require('pg')

// const pool = new Pool({
//   user: 'postgres',
//   host: 'localhost',
//   database: 'pms',
//   password: '12345',
//   port: 5432,
// })

const pool = new Pool({
  user: 'vpdhpwcheyeuip',
  host: 'ec2-107-20-185-27.compute-1.amazonaws.com',
  database: 'd75s2eaqm34tgp',
  password: 'c79b86048f9da1439d78ee6a1fcc7527d798478508e6533a34029c4fde59a07e',
  port: 5432
})

var indexRouter = require('./routes/index')(pool);
var projectsRouter = require('./routes/projects')(pool);
var profileRouter = require('./routes/profile')(pool);

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(fileupload());
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use(session({
  secret: 'session',
  resave: false,
  saveUninitialized: false
}))

app.use(flash())

app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/projects', projectsRouter);
app.use('/profile', profileRouter);


// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
