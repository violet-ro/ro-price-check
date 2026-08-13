const express = require('express');
const schedule = require('node-schedule');
const { execSync } = require('child_process');
const path = require('path');
const app = express();
const PORT = 3001;

app.use(express.static('.'));

function runScrape() {
  try {
    const scraperDir = path.join(__dirname, 'scraper');
    const rootDir = __dirname;
    const timestamp = new Date().toLocaleString();
    console.log(`[${timestamp}] Running npm run scrape in: ${scraperDir}`);
    execSync('npm run scrape', { cwd: scraperDir, stdio: 'inherit' });
    console.log(`[${new Date().toLocaleString()}] Scrape completed successfully`);
    
    // Commit and push to git
    try {
      console.log(`[${new Date().toLocaleString()}] Staging changes...`);
      execSync('git add data/vending-history.json', { cwd: rootDir, stdio: 'inherit' });
      
      console.log(`[${new Date().toLocaleString()}] Committing changes...`);
      const commitMsg = `Update vending data - ${new Date().toLocaleString()}`;
      execSync(`git commit -m "${commitMsg}"`, { cwd: rootDir, stdio: 'inherit' });
      
      console.log(`[${new Date().toLocaleString()}] Pushing to remote...`);
      execSync('git push', { cwd: rootDir, stdio: 'inherit' });
      
      console.log(`[${new Date().toLocaleString()}] Git push completed successfully`);
      return { success: true, message: 'Scrape completed and changes pushed to git' };
    } catch (gitError) {
      // Git operations failed but scrape succeeded
      console.warn(`[${new Date().toLocaleString()}] Git error (scrape still succeeded):`, gitError.message);
      return { success: true, message: 'Scrape completed but git push failed: ' + gitError.message };
    }
  } catch (error) {
    console.error(`[${new Date().toLocaleString()}] Scrape error:`, error.message);
    return { success: false, message: error.message };
  }
}

app.post('/api/refresh-scrape', (req, res) => {
  const result = runScrape();
  res.status(result.success ? 200 : 500).json(result);
});

// Schedule automatic scrapes at midnight (0:00), 8 AM (8:00), and 4 PM (16:00)
schedule.scheduleJob('0 0,8,16 * * *', () => {
  console.log('\n--- Scheduled scrape triggered ---');
  runScrape();
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('Scheduled scrapes at: 00:00 (midnight), 08:00 (8 AM), 16:00 (4 PM)');
});
