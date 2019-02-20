var express = require('express');
var router = express.Router();
const helpers = require('../helpers/util')

module.exports = function (pool) {

    // ================================ PROJECT ================================ //

    router.get('/', helpers.isLoggedIn, function (req, res, next) {
        const url = req.query.page ? req.url : '/?page=1'; //supaya ke page nya ikut
        const page = req.query.page || 1; //kalau req.query.page (null/undefined) maka page nya 1, kalau req.query.page (ada nilai) maka 1 nya tidak dipakai
        const limit = 5;
        const offset = (page - 1) * limit // rumus offset (titik mulainya)
        let searching = false;
        let params = [];

        if (req.query.checkid && req.query.id) {
            params.push(`projects.projectid = ${req.query.id}`);
            searching = true;
        }

        if (req.query.checkname && req.query.name) {
            params.push(`projects.name ilike '%${req.query.name}%'`); //ilike -> mengenal semua bentuk huruf mau besar atau kecil dan % -> untuk mencari perhuruf
            searching = true;
        }

        if (req.query.checkmember && req.query.member) {
            params.push(`CONCAT (users.firstname,' ', users.lastname) = '${req.query.member}'`);
            searching = true;
        }
        //distinct (menggabungkan)
        //menghitung jumlah data
        let sql = `select count(id) as total from (select distinct projects.projectid as id from projects 
            LEFT JOIN members ON projects.projectid = members.projectid
            LEFT JOIN users ON members.userid = users.userid`

        if (searching) {
            sql += ` where ${params.join(' AND ')}`
        }

        sql += `) as project_member`;

        pool.query(sql, (err, data) => {
            const totalPages = data.rows[0].total;
            const pages = Math.ceil(totalPages / limit) //Math.ceil pembulatan ke atas
            // console.log(totalPages, pages);

            //untuk menampilkan data dari project
            sql = `select distinct projects.projectid, projects.name from projects
            LEFT JOIN members ON projects.projectid = members.projectid
            LEFT JOIN users ON members.userid = users.userid`

            if (searching) {
                sql += ` where ${params.join(' AND ')}`
            }
            sql += ` ORDER BY projects.projectid LIMIT ${limit} OFFSET ${offset}`
            // console.log("jumlah data", sql)
            //untuk membatasi query member berdasarkan project yang akan diolah saja
            let subquery = `select distinct projects.projectid from projects LEFT JOIN members ON projects.projectid = members.projectid
            LEFT JOIN users ON members.userid = users.userid`

            if (searching) {
                subquery += ` where ${params.join(' AND ')}`
            }

            subquery += ` ORDER BY projectid LIMIT ${limit} OFFSET ${offset}`

            //untuk mendapatkan data member berdasarkan project
            let sqlMembers = `SELECT projects.projectid, CONCAT (users.firstname, ' ',users.lastname) AS fullname
            FROM members
            INNER JOIN projects ON members.projectid = projects.projectid
            INNER JOIN users ON users.userid = members.userid WHERE projects.projectid IN
            (${subquery})`;

            pool.query(sql, (err, projectData) => {

                pool.query(sqlMembers, (err, memberData) => {
                    console.log("sqlmember", sqlMembers);
                    projectData.rows.map(project => {
                        project.members = memberData.rows.filter(member => {
                            return member.projectid == project.projectid
                        }).map(item => item.fullname)
                    })

                    pool.query(`select CONCAT(firstname, ' ',lastname) AS fullname from users`, (err, usersData) => {

                        pool.query(`SELECT option -> 'option1' AS o1, option -> 'option2' AS o2, option -> 'option3' AS o3 FROM users where userid = ${req.session.user}`, (err, data) => {
                            let columnOne = data.rows[0].o1;
                            let columnTwo = data.rows[0].o2;
                            let columnThree = data.rows[0].o3;

                            res.render('projects/list', {
                                data: projectData.rows,
                                users: usersData.rows,
                                pagination: {
                                    pages,
                                    page,
                                    totalPages,
                                    url
                                },
                                query: req.query,
                                columnOne,
                                columnTwo,
                                columnThree,
                                user: req.session.user
                            })
                        })
                    })
                })
            })
        })
    });

    // ================================ OPTION CHECKLIST ================================ //

    router.post('/option', (req, res, next) => {
        let option1 = false;
        let option2 = false;
        let option3 = false;

        if (req.body.cid) {
            option1 = true;
        }
        if (req.body.cname) {
            option2 = true;
        }
        if (req.body.cmember) {
            option3 = true;
        }
        let sql = `UPDATE users SET option = option::jsonb || '{"option1" : ${option1}, "option2" : ${option2}, "option3" : ${option3}}' WHERE userid = ${req.session.user}`
        pool.query(sql, (err) => {
            // console.log(sql);
            if (err) {
                console.log(err);
            }
            res.redirect('/projects')
        })
    })

    //  ================================ EDIT ================================ //

    router.get('/edit/:id', function (req, res, next) {
        let id = req.params.id;
        // console.log("id", id)
        pool.query(`SELECT * FROM projects where projectid = ${id}`, (err, projectData) => {
            if (err) return res.send(err)
            pool.query(`SELECT userid FROM members where projectid = ${id}`, (err, memberData) => {
                if (err) return res.send(err)
                pool.query('select userid, firstname, lastname, position from users ORDER BY userid', (err, userData) => {
                    if (err) return res.send(err)
                    res.render('projects/edit', {
                        project: projectData.rows[0],
                        members: memberData.rows.map(item => item.userid), //[1,3,5]
                        users: userData.rows
                    })
                })
            })
        });
    });

    router.post('/edit/:id', (req, res, next) => {
        let id = req.params.id;
        let projectname = req.body.name;

        pool.query(`UPDATE projects set name='${projectname}' where projectid = ${id}`, (err) => {
            if (err) return res.send(err)
            pool.query(`DELETE FROM members where projectid =${id}`, (err) => {
                if (err) return res.send(err)
                if (req.body.users) {
                    if (Array.isArray(req.body.users)) {
                        let values = [];
                        req.body.users.forEach((item) => {
                            values.push(`(${id}, ${item.split("#")[0]}, '${item.split("#")[1]}')`);
                        })
                        let sqlMembers = `insert into members (projectid, userid, role) values `
                        sqlMembers += values.join(', ')
                        // console.log("query buat masukin members", sqlMembers);
                        pool.query(sqlMembers, (err) => {
                            if (err) return res.send(err)
                            res.redirect('/projects');
                        });
                    } else {
                        pool.query(`insert into members (projectid, userid, role) values (${id}, ${req.body.users.split("#")[0]}, '${req.body.users.split("#")[1]}')`, (err) => {

                            if (err) return res.send(err)
                            res.redirect('/projects');
                        });
                    }
                } else {
                    res.redirect('/projects');
                }
            })
        })
    })

    // ================================ ADD ================================ //

    router.get('/add', function (req, res, next) {
        pool.query('select * from users ORDER BY userid', (err, data) => {
            if (err) return res.send(err)
            res.render('projects/add', { users: data.rows });
        })
    });

    router.post('/add', function (req, res, next) {
        pool.query(`insert into projects (name) values ('${req.body.name}')`, (err) => {
            if (err) return res.send(err)
            if (req.body.users) {
                // select projectid from projects order by projectid desc limit 1
                pool.query(`select max(projectid) from projects`, (err, latestId) => {
                    if (err) return res.send(err)
                    let projectId = latestId.rows[0].max;
                    if (Array.isArray(req.body.users)) {
                        let values = [];
                        req.body.users.forEach((item) => {
                            values.push(`(${projectId}, ${item.split("#")[0]}, '${item.split("#")[1]}')`);
                        })
                        let sqlMembers = `insert into members (projectid, userid, role) values `
                        sqlMembers += values.join(', ')
                        // console.log("query buat masukin members", sqlMembers);
                        pool.query(sqlMembers, (err) => {
                            if (err) return res.send(err)
                            res.redirect('/projects');
                        });
                    } else {
                        pool.query(`insert into members (projectid, userid, role) values (${projectId}, ${req.body.users.split("#")[0]}, '${req.body.users.split("#")[1]}')`, (err) => {
                            if (err) return res.send(err)
                            res.redirect('/projects');
                        });
                    }
                })

            } else {
                res.redirect('/projects');
            }
        });
    });

    //  ================================ DELETE ================================ //

    router.get('/delete/:id', function (req, res, next) {
        let id = req.params.id;
        pool.query(`DELETE FROM members where projectid = ${id}`, (err) => {
            if (err) return res.send(err)
            pool.query(`DELETE FROM projects where projectid = ${id}`, (err) => {
                if (err) return res.send(err)
                console.log(`data berhasil di delete`);
                res.redirect('/projects');
            });
        });
    });

    //  ================================ PROJECT OVERVIEW ================================ //

    router.get('/overview/:projectid', helpers.isLoggedIn, function (req, res, next) {
        let projectid = req.params.projectid;

        let sqlMembers = `SELECT CONCAT(firstname,' ',lastname) AS fullname FROM users WHERE userid IN (SELECT userid FROM members WHERE projectid = ${projectid})`

        pool.query(sqlMembers, (err, members) => {
            pool.query(`SELECT * FROM projects where projectid = ${projectid}`, (err, projectData) => {
                if (err) return res.send(err)
                //console.log(sqlMembers)
                res.render('overview/view', { projectid, identity: 'overview', members: members.rows, project: projectData.rows[0] })
            })
        })
    });

    //  ================================ PROJECT ACTIVITY ================================ //

    router.get('/activity/:projectid', helpers.isLoggedIn, function (req, res, next) {
        let projectid = req.params.projectid;
        res.render('activity/view', { projectid, identity: 'activity' });
    });

    //  ================================ PROJECT MEMBERS ================================ //

    router.get('/members/:projectid', helpers.isLoggedIn, function (req, res, next) {
        let projectid = req.params.projectid;
        const url = req.query.page ? req.url : `/members/${projectid}/?page=1`; //supaya ke page nya ikut
        const page = req.query.page || 1; //kalau req.query.page (null/undefined) maka page nya 1, kalau req.query.page (ada nilai) maka 1 nya tidak dipakai
        const limit = 5;
        const offset = (page - 1) * limit // rumus offset (titik mulainya)
        let searching = false;
        let params = [];

        if (req.query.checkid && req.query.id) {
            params.push(`users.userid = ${req.query.id}`);
            searching = true;
        }

        if (req.query.checkname && req.query.name) {
            params.push(`CONCAT (users.firstname,' ', users.lastname) ilike '%${req.query.name}%'`);
            searching = true;
        }

        if (req.query.checkposition && req.query.position) {
            params.push(`members.role = '${req.query.position}'`); //ilike -> mengenal semua bentuk huruf mau besar atau kecil dan % -> untuk mencari perhuruf
            searching = true;
        }

        //distinct (menggabungkan)userid
        //menghitung jumlah data
        let sql = `select count(*) as total from members left join users on members.userid = users.userid where projectid = ${projectid}`
        if (searching) {
            sql += ` and ${params.join(' AND ')}`
        }

        pool.query(sql, (err, data) => {
            const totalPages = data.rows[0].total;
            const pages = Math.ceil(totalPages / limit) //Math.ceil pembulatan ke atas
            // console.log(totalPages, pages);
            let sql = `SELECT members.id, members.userid, CONCAT(users.firstname,' ', users.lastname) as fullname, members.projectid, members.role FROM members left join users on members.userid = users.userid where members.projectid = ${projectid}`
            if (searching) {
                sql += ` and ${params.join(' AND')}`
            }
            sql += ` ORDER BY members.id LIMIT ${limit} OFFSET ${offset}`

            pool.query(sql, (err, memberData) => {
                //console.log("sql cuy", sql)

                pool.query(`SELECT optionmembers -> 'option1' AS o1, optionmembers -> 'option2' AS o2, optionmembers -> 'option3' AS o3 FROM users where userid = ${req.session.user}`, (err, data) => {
                    let columnOne = data.rows[0].o1;
                    let columnTwo = data.rows[0].o2;
                    let columnThree = data.rows[0].o3;

                    res.render('members/list', {
                        projectid,
                        identity: 'members',
                        data: memberData.rows,
                        pagination: {
                            pages,
                            page,
                            totalPages,
                            url
                        },
                        query: req.query,
                        columnOne,
                        columnTwo,
                        columnThree,
                        user: req.session.user
                    })
                })
            })
        })
    })

    // ================================ OPTION MEMBERS ================================ //

    router.post('/members/:projectid/option', helpers.isLoggedIn, (req, res, next) => {

        let option1 = false;
        let option2 = false;
        let option3 = false;

        if (req.body.cid) {
            option1 = true;
        }
        if (req.body.cname) {
            option2 = true;
        }
        if (req.body.cmember) {
            option3 = true;
        }
        let sql = `UPDATE users SET optionmembers = optionmembers::jsonb || '{"option1" : ${option1}, "option2" : ${option2}, "option3" : ${option3}}' WHERE userid = ${req.session.user}`
        pool.query(sql, (err) => {
            // console.log(sql);

            if (err) {
                console.log(err);
            }
            res.redirect(`/projects/members/${req.params.projectid}`)
        })
    })

    // ================================ PROJECT MEMBERS ADD ================================ //

    router.get('/members/:projectid/add', helpers.isLoggedIn, function (req, res, next) {
        let sqlB = `SELECT userid, CONCAT(firstname,' ',lastname) AS fullname, position FROM users`
        pool.query(sqlB, (err, userData) => {
            if (err) return res.send(err)
            res.render('members/add', {
                users: userData.rows,
                positions: helpers.positionEnum
            });
        })
    });

    router.post('/members/:projectid/add', helpers.isLoggedIn, function (req, res, next) {
        let sqlB = `INSERT into members (userid, projectid, role) values (${req.body.user}, ${req.params.projectid}, '${req.body.position}')`
        pool.query(sqlB, (err, userData) => {
            if (err) return res.send(err)
            res.redirect(`/projects/members/${req.params.projectid}`)
        })
    })

    // ================================ PROJECT MEMBERS EDIT ================================ //

    router.get('/members/:projectid/edit/:id', helpers.isLoggedIn, function (req, res, next) {

        let projectid = req.params.projectid;
        let id = req.params.id;
        let sqlA = `SELECT members.*, CONCAT(users.firstname,' ',users.lastname) AS fullname FROM members left join users on members.userid = users.userid where id = ${id}`


        pool.query(sqlA, (err, memberData) => {
            if (err) return res.send(err)

            res.render('members/edit', {
                member: memberData.rows[0],
                positions: helpers.positionEnum,
                projectid
            })
        })
    });

    router.post('/members/:projectid/edit/:id', helpers.isLoggedIn, function (req, res, next) {
        let id = req.params.id;
        let sql = `UPDATE members set role = '${req.body.position}' where id = ${id}`
        pool.query(sql, (err, memberData) => {
            if (err) return res.send(err)
            res.redirect(`/projects/members/${req.params.projectid}`)
        })
    });

    // ================================ PROJECT MEMBERS DELETE ================================ //



    //  ================================ PROJECT ISSUES ================================ //

    router.get('/issues/:projectid', helpers.isLoggedIn, function (req, res, next) {
        let projectid = req.params.projectid;
        res.render('issues/list', {
            projectid,
            identity: 'issues'
        });
    });
    //  ================================ PROJECT ISSUES ================================ //

    router.get('/issues/:projectid/add', helpers.isLoggedIn, function (req, res, next) {
        let projectid = req.params.projectid;
        res.render('issues/add', {
            projectid,
            identity: 'issues'
        });
    });


    // ================================ ADD ================================ //



    return router;
}