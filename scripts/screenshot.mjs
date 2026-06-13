import { chromium } from 'playwright'

const CHROMIUM = '/home/vscode/.cache/ms-playwright/chromium-1223/chrome-linux/chrome'
process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = '1'

const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  headless: true,
})

const page = await browser.newPage()
await page.setViewportSize({ width: 1280, height: 720 })
await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' })

// Wait for 3D scene to render
await page.waitForTimeout(3000)
await page.screenshot({ path: '/workspaces/k8s-dashboard/screenshot-scatter2.png' })
console.log('✓ scatter')

// Hierarchy layout
await page.click('button:has-text("Hierarchy")')
await page.waitForTimeout(2500)
await page.screenshot({ path: '/workspaces/k8s-dashboard/screenshot-hierarchy.png' })
console.log('✓ hierarchy')

// List layout
await page.click('button:has-text("List")')
await page.waitForTimeout(2500)
await page.screenshot({ path: '/workspaces/k8s-dashboard/screenshot-list.png' })
console.log('✓ list')

// Filter pinned mode — go back to scatter first
await page.click('button:has-text("Scatter")')
await page.waitForTimeout(1000)
await page.keyboard.press('/')
await page.waitForTimeout(300)
await page.keyboard.type('default')
await page.waitForTimeout(500)
await page.keyboard.press('Escape')   // close input, pin filter
await page.waitForTimeout(1500)
await page.screenshot({ path: '/workspaces/k8s-dashboard/screenshot-filter-pinned.png' })
console.log('✓ filter-pinned')

await browser.close()
console.log('Done.')
