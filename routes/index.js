var express = require('express');
var router = express.Router();

module.exports = function (pool) {
  /* GET home page. */
  router.get('/', function (req, res, next) {
    res.render('login', {
      loginMessage: req.flash('loginMessage')
    });
  });

  router.post('/login', function (req, res) {
    let emails = req.body.email;
    let passwords = req.body.password;
    pool.query(`SELECT * FROM users WHERE email='${emails}' and password='${passwords}'`, (err, data) => {
      // console.log(data.rows);
      if (data.rows.length == 0) {
        req.flash('loginMessage', 'Email atau Password Salah');
        res.redirect('/')
      } else {
        req.session.user = data.rows[0].userid
        req.session.status = data.rows[0].status
        res.redirect('/projects')
      }
    })
  })

  router.get('/logout', (req, res) => {
    req.session.destroy(() => {
      res.redirect('/')
    })
  })

  return router;
}
