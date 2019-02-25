var express = require('express');
var router = express.Router();
const helpers = require('../helpers/util');
var path = require('path');
var moment = require('moment');


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
                    // console.log("sqlmember", sqlMembers);
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
            params.push(`members.id = ${req.query.id}`);
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
        let projectid = req.params.projectid;
        let sqlB = `select userid, concat(firstname,' ',lastname) as fullname, position from users where userid not in
        (select userid from members where projectid = ${projectid})`
        pool.query(sqlB, (err, userData) => {
            if (err) return res.send(err)
            res.render('members/add', {
                users: userData.rows,
                positions: helpers.positionEnum,
                projectid,
                identity: 'members'
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
                projectid,
                identity: 'members'
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

    router.get('/members/:projectid/delete/:id', function (req, res, nest) {
        let projectid = req.params.projectid;
        let id = req.params.id;
        pool.query(`delete from members where projectid = ${projectid} and id = ${id}`, (err) => {
            if (err) return res.send(err)
            res.redirect(`/projects/members/${projectid}`)
        })
    })

    //  ================================ PROJECT ISSUES ================================ //

    router.get('/issues/:projectid', helpers.isLoggedIn, function (req, res, next) {
        let projectid = req.params.projectid;
        const url = req.query.page ? req.url : `/issues/${projectid}/?page=1`;
        const page = req.query.page || 1;
        const limit = 3;
        const offset = (page - 1) * limit
        let searching = false;
        let params = [];

        if (req.query.checkid && req.query.issuesid) {
            params.push(`issues.issuesid = ${req.query.issuesid}`)
            searching = true;
        }
        if (req.query.checksubject && req.query.subject) {
            params.push(`issues.subject ilike '%${req.query.subject}%'`)
            searching = true;
        }
        if (req.query.checktracker && req.query.tracker) {
            params.push(`issues.tracker = '${req.query.tracker}'`)
            searching = true;
        }

        let sql = `select count(*) as total from issues where projectid = ${projectid}`
        if (searching) {
            sql += ` and ${params.join(' and ')}`
        }

        pool.query(sql, (err, count) => {
            const totalPages = count.rows[0].total;
            const pages = Math.ceil(totalPages / limit)

            sql = `select * from issues where projectid = ${projectid}`;
            if (searching) {
                sql += ` and ${params.join(' and ')}`
            }
            sql += ` order by projectid limit ${limit} offset ${offset}`;

            pool.query(sql, (err, dataissues) => {

                pool.query(`select optionissues -> 'option1' as o1, optionissues -> 'option2' as o2, optionissues -> 'option3' as o3 from users
                where userid=${req.session.user}`, (err, opsi) => {
                        let columnOne = opsi.rows[0].o1;
                        let columnTwo = opsi.rows[0].o2;
                        let columnThree = opsi.rows[0].o3;
                        res.render('issues/list', {
                            projectid,
                            identity: 'issues',
                            data: dataissues.rows,
                            pagination: {
                                pages,
                                url,
                                page,
                                totalPages
                            },
                            query: req.query,
                            columnOne,
                            columnTwo,
                            columnThree,
                            user: req.session.user
                        })
                    })
            })
        });
    });

    // ======================================== OPTION ISSUES ===============================================

    router.post('/issues/:projectid/option', (req, res, next) => {
        //console.log('router ini jalan', req.body);
        let id = req.params.projectid;
        let option1 = false;
        let option2 = false;
        let option3 = false;

        if (req.body.id) {
            option1 = true;
        }
        if (req.body.subject) {
            option2 = true;
        }
        if (req.body.tracker) {
            option3 = true;
        }

        let sql = `update users set optionissues = optionissues::jsonb || '{"option1" : ${option1}, "option2" : ${option2}, "option3" : ${option3}}' where userid = ${req.session.user}`;
        console.log('sql:', sql);
        pool.query(sql, (err) => {
            if (err) {
                console.log(err);
            }
            res.redirect(`/projects/issues/${id}`)
        })
    })

    //  ================================ PROJECT ISSUES ADD================================ //

    router.get('/issues/:projectid/add', helpers.isLoggedIn, function (req, res, next) {
        let projectid = req.params.projectid;

        pool.query(`select concat(firstname,' ',lastname) as fullname, members.userid from members left join users on members.userid = users.userid where members.projectid = ${projectid}`, (err, memberData) => {

            pool.query(`select name from projects where projectid = ${projectid}`, (err, projectData) => {
                if (err) return res.send(err)

                res.render('issues/add', {
                    projectid,
                    identity: 'issues',
                    members: memberData.rows,
                    project: projectData.rows[0]
                })
            })
        })
    })

    router.post('/issues/:projectid/add', helpers.isLoggedIn, function (req, res, next) {
        let projectid = req.params.projectid;
        let tracker = req.body.tracker;
        let subject = req.body.subject;
        let description = req.body.description;
        let status = req.body.status;
        let priority = req.body.priority;
        let assignee = req.body.assignee;
        let startdate = req.body.startdate;
        let duedate = req.body.duedate;
        let estimatedtime = req.body.estimatedtime;
        let done = req.body.done;
        let file = req.files.filedoc;
        let filename = file.name.toLowerCase().replace('', Date.now());
        let x = req.body;

        let author = `${req.session.user}`

        // let sqLog = `insert into activity (issuesid, time, title, description, author, status) values
        //              (${issuesid}, current_timestamp, '${x.subject}', '${x.description}', ${author}, '${x.status}')`


        let sql = `INSERT INTO issues(projectid, tracker, subject, description, status, priority, assignee, startdate, duedate, estimatedtime, done, files, createddate) VALUES (${projectid}, '${tracker}', '${subject}', '${description}', '${status}', '${priority}', ${assignee}, '${startdate}', '${duedate}', ${estimatedtime}, ${done}, '${filename}', current_timestamp)`;

        if (req.files) {
            file.mv(path.join(__dirname, `../public/fileupload/${filename}`), function (err) {
                if (err) console.log(err)
            })
        }

        pool.query(sql, (err) => {
            console.log("sqlmem", sql)
            if (err) return res.send(err)
            // pool.query(sqLog, (err) => {
            //     console.log("sqlog", sqLog)
            //     if (err) return res.send(err)
            res.redirect(`/projects/issues/${projectid}`)
            // })
        })

    });

    //  ================================ PROJECT ISSUES EDIT ================================ //

    router.get('/issues/:projectid/edit/:issuesid', helpers.isLoggedIn, function (req, res) {
        let author = `${req.session.user}`
        console.log("author", author)
        let projectid = req.params.projectid;
        let issuesid = req.params.issuesid
        let sqlmembers = `select concat(firstname,' ',lastname) as fullname,members.userid  
        from members left join users on members.userid = users.userid  
        where members.projectid = ${projectid}`

        pool.query(`select issuesid, subject from issues where projectid = ${projectid}`, (err, dataTask) => {
            pool.query(`select * from issues where issuesid = ${issuesid}`, (err, dataIssue) => {
                pool.query(sqlmembers, (err, memberData) => {
                    pool.query(`select name from projects where projectid = ${projectid}`, (err, projectData) => {
                        pool.query(`select userid, email, concat(firstname,' ',lastname) as fullname from users where userid = ${author}`, (err, dataAuthor) => {
                            res.render('issues/edit', {
                                projectid,
                                identity: 'issues',
                                members: memberData.rows,
                                project: projectData.rows[0],
                                dataissues: dataIssue.rows[0],
                                moment,
                                datatask: dataTask.rows,
                                dataAuthor: dataAuthor.rows[0],
                            })
                        })
                    })
                })
            })
        })
    })

    router.post('/issues/:projectid/edit/:issuesid', helpers.isLoggedIn, function (req, res, next) {
        console.log(req.body);
        let projectid = req.params.projectid;
        let issuesid = req.params.issuesid
        let x = req.body;
        let file = req.files.filedoc;
        let filename = file.name.toLowerCase().replace('', Date.now());

        //logger by activity
        let author = `${req.session.user}`
        let sqLog = `insert into activity (issuesid, time, title, description, author, status) values
                     (${issuesid}, current_timestamp, '${x.subject}', '${x.description}', ${author}, '${x.status}')`



        let sql1 = `update issues set projectid = ${projectid}, tracker= '${x.tracker}',
                   subject = '${x.subject}', description = '${x.description}', status = '${x.status}',
                   priority = '${x.priority}', assignee = ${x.assignee}, startdate = '${x.startdate}',
                   duedate = '${x.duedate}', estimatedtime = ${x.estimatedtime}, done = ${x.done}, files = '${filename}',
                   spenttime =  ${x.spenttime}, targetversion = '${x.targetversion}', author = ${author}, updatedate = current_timestamp
                   where issuesid = ${issuesid}`

        let sql2 = `update issues set projectid = ${projectid}, tracker= '${x.tracker}',
                   subject = '${x.subject}', description = '${x.description}', status = '${x.status}',
                   priority = '${x.priority}', assignee = ${x.assignee}, startdate = '${x.startdate}',
                   duedate = '${x.duedate}', estimatedtime = ${x.estimatedtime}, done = ${x.done}, files = '${filename}',
                   spenttime =  ${x.spenttime}, targetversion = '${x.targetversion}', author = ${author},
                   closedate = current_timestamp  where issuesid = ${issuesid}`


        //console.log(sql);
        if (req.files) {
            file.mv(path.join(__dirname, `../public/fileupload/${filename}`), function (err) {
                if (err) console.log(err)
            })
        }

        if (x.status == 'Closed') {
            pool.query(sql2, (err) => {
                console.log('SQL2', sql2);
                if (err) return res.send(err)
                pool.query(sqLog, (err) => {
                    if (err) return res.send(err)
                    res.redirect(`/projects/issues/${projectid}`)
                })
            })
        } else {
            pool.query(sql1, (err) => {
                console.log('SQL1', sql1);
                if (err) return res.send(err)
                pool.query(sqLog, (err) => {
                    if (err) return res.send(err)
                    res.redirect(`/projects/issues/${projectid}`)
                })
            })
        }
    })


    //  ================================ PROJECT ISSUES DELETE ================================ //
    router.get('/issues/:projectid/delete/:issuesid', function (req, res, next) {
        let projectid = req.params.projectid
        pool.query(`delete from issues where projectid = ${projectid} and issuesid = ${req.params.issuesid}`, (err) => {
            if (err) return res.send(err)
            //console.log('data berhasil dihapus');
            res.redirect(`/projects/issues/${projectid}`)
        })
    })

    //  ================================ PROJECT OVERVIEW ================================ //

    router.get('/overview/:projectid', helpers.isLoggedIn, function (req, res, next) {
        let projectid = req.params.projectid;
        let bug = 0
        let bugOpen = 0

        let feature = 0
        let featureOpen = 0

        let support = 0
        let supportOpen = 0

        pool.query(`select count(tracker) from issues where projectid = ${projectid} and tracker = 'Bug'`, (err, dataA) => {
            bug = dataA.rows[0].count

            pool.query(`select count(tracker) from issues where projectid = ${projectid} AND status != 'Clossed' and tracker = 'Bug' `, (err, dataD) => {
                bugOpen = dataD.rows[0].count

                pool.query(`select count(tracker) from issues where projectid = ${projectid} and tracker = 'Feature'`, (err, dataB) => {
                    feature = dataB.rows[0].count

                    pool.query(`select count(tracker) from issues where projectid = ${projectid} AND status != 'Clossed' and tracker = 'Feature' `, (err, dataE) => {
                        featureOpen = dataE.rows[0].count

                        pool.query(`select count(tracker) from issues where projectid = ${projectid} and tracker = 'Support'`, (err, dataC) => {
                            support = dataC.rows[0].count

                            pool.query(`select count(tracker) from issues where projectid = ${projectid} AND status != 'Clossed' and tracker = 'Support' `, (err, dataF) => {
                                supportOpen = dataF.rows[0].count

                                let sqlMembers = `SELECT CONCAT(firstname,' ',lastname) AS fullname FROM users WHERE userid IN (SELECT userid FROM members WHERE projectid = ${projectid})`

                                pool.query(sqlMembers, (err, members) => {
                                    pool.query(`SELECT * FROM projects where projectid = ${projectid}`, (err, projectData) => {
                                        if (err) return res.send(err)
                                        //console.log(sqlMembers)
                                        res.render('overview/view', {
                                            projectid,
                                            identity: 'overview',
                                            members: members.rows,
                                            project: projectData.rows[0],
                                            bug,
                                            bugOpen,
                                            feature,
                                            featureOpen,
                                            support,
                                            supportOpen

                                        })
                                    })
                                })
                            })
                        })
                    })
                })
            })
        })
    })

    //  ================================ PROJECT ACTIVITY ================================ //

    // router.get('/activity/:projectid', helpers.isLoggedIn, function (req, res, next) {
    //     let projectid = req.params.projectid;
    //     let author = `${req.session.user}`
    //     let sql = `select * from activity where projectid = ${projectid}`


    //     pool.query(`select userid, email, concat(firstname,' ',lastname) as fullname from users where userid = ${author}`, (err, dataAuthor) => {
    //         pool.query(sql, (err, data) => {
    //             res.render('activity/view', {
    //                 projectid,
    //                 identity: 'activity',
    //                 data: data.rows,
    //                 moment,
    //                 dataAuthor: dataAuthor.rows[0]
    //             });
    //         })
    //     })
    // });


    router.get('/activity/:projectid', helpers.isLoggedIn, function (req, res, next) {
        let projectid = req.params.projectid;
        let author = `${req.session.user}`
        const today = new Date();
        const sevenDaysBefore = new Date(today.getTime() - (6 * 24 * 60 * 60 * 1000));


        const sql = `select activity.*, CONCAT(users.firstname,' ', users.lastname) as fullname  from activity left join users on activity.author = users.userid where time between '${moment(sevenDaysBefore).format('YYYY-MM-DD')}' and '${moment(today).add(1, 'days').format('YYYY-MM-DD')}' order by time desc`;
        console.log(sql);

        pool.query(sql, (err, data) => {

            let result = {};
            data.rows.forEach((item) => {
                if (result[moment(item.time).format('dddd')] && result[moment(item.time).format('dddd')].data) {
                    result[moment(item.time).format('dddd')].data.push(item);
                } else {
                    result[moment(item.time).format('dddd')] = { date: moment(item.time).format('YYYY-MM-DD'), data: [item] };
                }
            })
            // console.log(JSON.stringify(result));
            // for (var i=0 in result){
            //     console.log("data Object", result[i])
            // }

            console.log("data", result);
            res.render('activity/view', {
                projectid,
                identity: 'activity',
                data: result,
                today,
                sevenDaysBefore,
                moment


            })
        })
    })



    return router;
}