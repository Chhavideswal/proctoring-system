const express = require("express");
const router = express.Router();
const controller = require("../controllers/proctorController");

router.post("/event", controller.saveEvent);
router.get("/report/:name", controller.getReport);
router.get("/report/:name/csv", controller.downloadCsv);
router.get("/report/:name/pdf", controller.downloadPdf);

module.exports = router;
