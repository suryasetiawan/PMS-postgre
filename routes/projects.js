var express = require('express');
var router = express.Router();
const helpers = require('../helpers/util')

module.exports = function (pool) {

    // ================================ PROJECT ================================ //

    router.get('/', helpers.isLoggedIn, function (req, res, next) {

        const url = req.query.page ? req.url : '/?page=1'; //supaya ke page nya ikut
        // const url = req.url == '/' ? '/?page=1' : req.url;
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
            console.log("jumlah data", sql)
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

                            res.render('projects/projects', {
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

    router.get('/:id/project_overview', helpers.isLoggedIn, function (req, res, next) {
        let id = req.params.id;

        let sqlMembers = `SELECT CONCAT(firstname,' ',lastname) AS fullname FROM users WHERE userid IN (SELECT userid FROM members WHERE projectid = ${id})`

        pool.query(sqlMembers, (err, members) => {
            pool.query(`SELECT * FROM projects where projectid = ${id}`, (err, projectData) => {
                if (err) return res.send(err)
                console.log(sqlMembers)
                res.render('project_overview', { members: members.rows, project: projectData.rows[0] })
            })
        })
    });

    //  ================================ PROJECT ACTIVITY ================================ //

    router.get('/:id/project_activity', helpers.isLoggedIn, function (req, res, next) {
        res.render('project_activity');
    });



    //  ================================ PROJECT MEMBER ================================ //

    router.get('/:id/project_member', helpers.isLoggedIn, function (req, res, next) {
        let id = req.params.id;
        const url = req.query.page ? req.url : `/${id}/project_member/?page=1`; //supaya ke page nya ikut
        // const url = req.url == '/' ? '/?page=1' : req.url;
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
            params.push(`users.position ilike '%${req.query.position}%'`); //ilike -> mengenal semua bentuk huruf mau besar atau kecil dan % -> untuk mencari perhuruf
            searching = true;
        }


        //distinct (menggabungkan)
        //menghitung jumlah data
        let sql = `select count(*) as total from users where userid IN (SELECT userid from members where projectid = ${id} )`
        if (searching) {
            sql += ` and ${params.join(' AND ')}`
        }


        pool.query(sql, (err, data) => {
            const totalPages = data.rows[0].total;
            const pages = Math.ceil(totalPages / limit) //Math.ceil pembulatan ke atas
            // console.log(totalPages, pages);
            let sql = `SELECT position, userid, CONCAT(firstname,' ', lastname) as fullname FROM users WHERE userid IN (SELECT userid FROM members WHERE projectid = ${id})`
            if (searching) {
                sql += ` and ${params.join(' AND')}`
            }
            sql += ` ORDER BY userid LIMIT ${limit} OFFSET ${offset}`


            pool.query(sql, (err, projectData) => {
                console.log("sql cuy", sql)
            
               pool.query(`SELECT optionmembers -> 'option1' AS o1, optionmembers -> 'option2' AS o2, optionmembers -> 'option3' AS o3 FROM users where userid = ${req.session.user}`, (err, data) => {
                    let columnOne = data.rows[0].o1;
                    let columnTwo = data.rows[0].o2;
                    let columnThree = data.rows[0].o3;

                    res.render('project_member', {
                        data: projectData.rows,
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
                        user: req.session.user,
                        params: req.params.id
                    })
                })

            })
        })
    })
    //});

    // ================================ OPTION CHECKLIST ================================ //

    router.post('/:id/project_member/option', helpers.isLoggedIn, (req, res, next) => {

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
            res.redirect(`/projects/${req.params.id}/project_member`)
        })
    })

    // ================================ Project Member ADD ================================ //

    router.get('/:id/project_member/add', helpers.isLoggedIn, function (req, res, next) {
        res.render('project_member_add');
    });




    // router.get('/:id/project_member', helpers.isLoggedIn, function (req, res, next) {
    //     let id = req.params.id;
    //     const url = req.query.page ? req.url : '/?page=1';
    //     const page = req.query.page || 1;
    //     const limit = 3;
    //     const offset = (page - 1) * limit
    //     let searching = false;
    //     let params = [];


    //     if (req.query.checkid && req.query.id) {
    //         params.push(`users.userid = ${req.query.id}`);
    //         searching = true;
    //     }

    //     if (req.query.checkposition && req.query.position) {
    //         params.push(`users.position ilike '%${req.query.position}%'`); //ilike -> mengenal semua bentuk huruf mau besar atau kecil dan % -> untuk mencari perhuruf
    //         searching = true;
    //     }

    //     if (req.query.checkmember && req.query.member) {
    //         params.push(`CONCAT (users.firstname,' ', users.lastname) = '${req.query.member}'`);
    //         searching = true;
    //     }
    //     //distinct (menggabungkan)
    //     //menghitung jumlah data
    //     let sql = `select count(*) as total from users where userid IN (SELECT userid from members where projectid = ${id} )`
    //     if (searching) {
    //         sql += ` where ${params.join(' AND ')}`
    //     }

    //     pool.query(sql, (err, data) => {
    //         let totalPages = data.rows[0].total;
    //         let pages = Math.ceil(totalPages / limit);
    //         let sql = `SELECT position, userid, CONCAT(firstname,' ', lastname) as fullname FROM users WHERE userid IN (SELECT userid FROM members WHERE projectid = ${id}) ORDER BY userid`
    //         if (searching) {
    //             sql += ` where ${params.join(' AND')}`
    //         }
    //         pool.query(`SELECT option -> 'option1' AS o1, option -> 'option2' AS o2, option -> 'option3' AS o3 FROM users where userid = ${req.session.user}`, (err, data) => {
    //             let columnOne = data.rows[0].o1;
    //             let columnTwo = data.rows[0].o2;
    //             let columnThree = data.rows[0].o3;

    //         pool.query(sql, (err, projectData) => {



    //                 res.render('project_member', {
    //                     data: projectData.rows,

    //                     pagination: {
    //                         pages,
    //                         page,
    //                         totalPages,
    //                         url
    //                     },
    //                     query: req.query,
    //                     columnOne,
    //                     columnTwo,
    //                     columnThree,
    //                     user: req.session.user
    //                 })
    //             })

    //         });
    //     });
    // });



    // ================================ OPTION PROJECT MEMBER ================================ //

    // router.post('/:id/project_member/option', (req, res, next) => {
    //     let option1 = false;
    //     let option2 = false;
    //     let option3 = false;

    //     if (req.body.cid) {
    //         option1 = true;
    //     }
    //     if (req.body.cname) {
    //         option2 = true;
    //     }
    //     if (req.body.cmember) {
    //         option3 = true;
    //     }
    //     let sql = `UPDATE users SET option = option::jsonb || '{"option1" : ${option1}, "option2" : ${option2}, "option3" : ${option3}}' WHERE userid = ${req.session.user}`
    //     pool.query(sql, (err) => {
    //         // console.log(sql);

    //         if (err) {
    //             console.log(err);
    //         }
    //         res.redirect('/projects/:id/project_member')
    //     })
    // })


    //  ================================ PROJECT ISSUES ================================ //

    router.get('/:id/project_issues', helpers.isLoggedIn, function (req, res, next) {
        res.render('project_issues');
    });
    //  ================================ PROJECT ISSUES ================================ //

    router.get('/:id/project_issues/add', helpers.isLoggedIn, function (req, res, next) {
        res.render('project_newissues');
    });


     // ================================ ADD ================================ //

    

    return router;
}