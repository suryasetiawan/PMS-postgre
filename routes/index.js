var express = require('express');
var router = express.Router();
// const helpers = require('../helpers/util')

module.exports = function(pool){
/* GET home page. */
router.get('/', function(req, res, next) {
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
      res.redirect('/projects')
    }
  })
})

router.get('/logout', (req, res)=>{
  req.session.destroy(()=>{
    res.redirect('/')
  })
})

router.get('/delete', function (req, res, next) {
  let id = req.query.id;
  pool.query(`delete from projects where projectid= ${id}`,
    req.body.id, (err) => {
      if (err) {
        console.error(err.messsage);
      }
      console.log('delete success');
      res.redirect('/projects');
    })
});

return router;
}
