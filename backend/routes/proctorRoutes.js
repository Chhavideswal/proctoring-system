const Log = require("../models/logs");
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const express = require('express');
const router = express.Router();

router.post('/event', async (req, res) => {
  try {
    const { candidateName, eventType, timestamp } = req.body;
    const doc = new Log({ candidateName, eventType, timestamp: timestamp ? new Date(timestamp) : undefined });
    await doc.save();
    res.json({ ok: true, log: doc });
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
});

router.get('/report/:name', async (req, res) => {
  try {
    const name = req.params.name;
    const logs = await Log.find({ candidateName: name }).sort({ timestamp: -1 }).limit(5000);
    res.json(logs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/report/:name/csv', async (req, res) => {
  try {
    const name = req.params.name;
    const logs = await Log.find({ candidateName: name }).sort({ timestamp: 1 });
    const filename = `report_${name}_${Date.now()}.csv`;
    const csvWriter = createCsvWriter({
      path: filename,
      header: [
        {id:'timestamp', title:'timestamp'},
        {id:'eventType', title:'eventType'}
      ]
    });
    const records = logs.map(l => ({ timestamp: l.timestamp.toISOString(), eventType: l.eventType }));
    await csvWriter.writeRecords(records);
    res.download(path.resolve(filename), filename, (err) => {
      if(err) console.error(err);
      fs.unlink(filename, ()=>{});
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/report/:name/pdf', async (req, res) => {
  try {
    const name = req.params.name;
    const logs = await Log.find({ candidateName: name }).sort({ timestamp: 1 });

    const doc = new PDFDocument();
    res.setHeader('Content-disposition', `attachment; filename=report_${name}.pdf`);
    res.setHeader('Content-type', 'application/pdf');
    doc.pipe(res);

    doc.fontSize(20).text(`Proctoring Report — ${name}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Generated: ${new Date().toLocaleString()}`);
    doc.moveDown();

    let count = 0;
    logs.forEach(l => {
      count++;
      doc.fontSize(10).text(`${count}. ${l.timestamp.toLocaleString()} — ${l.eventType}`);
      if(doc.y > 700) { doc.addPage(); }
    });

    doc.end();

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});
module.exports = router;
