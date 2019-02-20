module.exports = {
    isLoggedIn : (req, res, next)=>{
      if(!req.session.user){
        return res.redirect('/')
      }
      next()
    },
    positionEnum: ["Manager","Software Developer","Quality Assurance"]
  }