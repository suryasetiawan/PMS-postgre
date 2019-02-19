var express = require('express');
var router = express.Router();
const helpers = require('../helpers/util')

module.exports = function (pool) {


    router.get('/', helpers.isLoggedIn, (req, res) => {
        pool.query(`SELECT * from users where userid = ${req.session.user}`, (err, data) => {
        //    console.log("data --, ", data)
            if (err) {
                console.error(err);
                res.send(err);
            }
            res.render('profile', {
                data: data.rows[0]
                // role: data.rows[0].role
            })
            //console.log(data.rows[0].email);
        })
    });
    

    router.post('/:id', helpers.isLoggedIn, (req, res, next) => {
        // console.log(req.params.id);
        let password = req.body.password;
        let position = req.body.position;
        let type = req.body.type;
        console.log(password)

        if(type == "on") {
            type = true
        } else {
            type = false
        }

        if(password == ''){
            let sql = `UPDATE users SET  position = '${position}', type = ${type} where userid = ${req.session.user}`
            pool.query(sql, (err) => {
                console.log(sql);
    
                if (err) {
                    console.log(err);
                }
                res.redirect('/profile')
            })
        } else {
            let sql = `UPDATE users SET password = '${password}', position = '${position}', type = ${type} where userid = ${req.session.user}`
            pool.query(sql, (err) => {
                console.log(sql);
    
                if (err) {
                    console.log(err);
                }
                res.redirect('/profile')
            })
        }

    })



    return router;
}