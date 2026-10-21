// Apps Script for the "Vistrow Voice · Blog & Content Calendar" sheet.
// Paste into Extensions > Apps Script, save, then run installTrigger() once
// and allow access. Every day at about 9 am IST it marks each Queued post
// whose date has come and whose page is live as Published, and points its
// Cover at the image on the live site. It runs in Google's cloud, so it works
// when every laptop is off.

function markPublishedPosts() {
  const sheet = SpreadsheetApp.getActive().getSheetByName('Blog posts');
  const values = sheet.getDataRange().getValues();
  const header = values[0];
  const col = (name) => header.indexOf(name);
  const date = col('Date'), status = col('Status'), url = col('URL'), cover = col('Cover');
  if ([date, status, url, cover].includes(-1)) throw new Error('Blog posts header changed');
  const today = new Date();
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (row[status] !== 'Queued' || !row[url] || !(row[date] instanceof Date) || row[date] > today) continue;
    const res = UrlFetchApp.fetch(row[url], { muteHttpExceptions: true, followRedirects: true });
    if (res.getResponseCode() !== 200) continue;
    const slug = String(row[url]).split('/').pop();
    sheet.getRange(r + 1, status + 1).setValue('Published');
    sheet.getRange(r + 1, cover + 1).setFormula(`=IMAGE("https://www.vistrowvoice.com/blog/${slug}-640.jpg")`);
  }
}

function installTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'markPublishedPosts')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('markPublishedPosts').timeBased().everyDays(1).atHour(9).inTimezone('Asia/Kolkata').create();
  markPublishedPosts();
}
