// dexblox/api/harga.js
const express = require("express");
const router = express.Router();

let hargaPer100 = 12000; // default global

// Ambil harga
router.get("/", (req,res)=>{
  res.json({hargaPer100});
});

// Update harga (admin)
router.post("/", (req,res)=>{
  const {harga} = req.body;
  if(!harga || harga <= 0){
    return res.status(400).json({error:"Harga tidak valid"});
  }
  hargaPer100 = harga;
  res.json({success:true,hargaPer100});
});

module.exports = router;
