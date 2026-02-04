# Community Monitor - User Guide

## How It Works

### Step 1: Select Monitoring Area
1. Switch to **"Community Monitor"** tab
2. Click **"Select Area"** button
3. A **fullscreen transparent window** will appear showing your current screen
4. **Drag with your mouse** to draw a rectangle around the area you want to monitor (e.g., Discord chat window)
5. Press **Enter** or click **"✓ Confirm"** to save the area
6. Press **Esc** to cancel selection

### Step 2: Start Monitoring
1. Set the **screenshot interval** (30-300 seconds, default: 60s)
2. Click **"Start Monitor"** button
3. The system will:
   - Take a screenshot of the **selected area only** every X seconds
   - Extract messages using LM Studio VLM OCR
   - Display messages in real-time
   - Save to JSON database
   - Generate hourly Excel reports

### Step 3: View Results
- **Real-time messages** appear in the list below
- **Red background** indicates alert messages (contains keywords like "BUG", "error", etc.)
- **Statistics** show total messages, alerts, and last screenshot time

## Why Fullscreen Selection?

The fullscreen transparent overlay is **necessary** to let you select ANY area on your screen:
- You need to see your entire desktop to find the chat window
- You drag to create a selection box
- The coordinates are saved (e.g., x: 500, y: 300, width: 400, height: 600)
- Future screenshots will ONLY capture that specific region

## Data Storage

- **Messages**: `data/messages.json`
- **Alerts**: `data/alerts.json`
- **Screenshots**: `screenshots/monitor_YYYY-MM-DD_HH-MM-SS.png`
- **Excel Reports**: `excel/YYYY-MM-DD_HH.xlsx` (generated hourly)

## Troubleshooting

**Q: Black screen when selecting area?**
- Make sure LM Studio is running
- Check terminal for errors
- Try restarting the application

**Q: No messages extracted?**
- Verify the selected area contains visible text
- Check LM Studio model is loaded (allenai/olmocr-2-7b)
- Ensure Discord/chat window is visible during screenshot

**Q: How to change monitored area?**
- Click "Select Area" again to reselect

## Technical Details

- **OCR Engine**: LM Studio with allenai/olmocr-2-7b VLM model
- **Screenshot Library**: screenshot-desktop (Node.js native)
- **Database**: JSON files (lightweight, no native dependencies)
- **Export Format**: Excel (.xlsx) with styling
- **Alert Keywords**: BUG, bug, error, problem, エラー, バグ, 不行, 问题

## Next Features (Coming Soon)

- [ ] Email alerts for negative messages
- [ ] More intelligent sentiment analysis
- [ ] Configuration persistence
- [ ] Multiple area monitoring
- [ ] Screenshot preview in UI
