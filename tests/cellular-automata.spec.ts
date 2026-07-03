import { test, expect } from '@playwright/test';

test.describe('Cellular Automata', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('1. Page loads and canvas renders', async ({ page }) => {
    // Check that the canvas exists
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    
    // Check that toolbar buttons are visible
    await expect(page.locator('#btn-play')).toBeVisible();
    await expect(page.locator('#btn-clear')).toBeVisible();
    await expect(page.locator('#btn-rules')).toBeVisible();
    
    // Check that info bar is visible
    await expect(page.locator('.info-bar')).toBeVisible();
  });

  test('2. Cell painting - click to add/remove cells', async ({ page }) => {
    const canvas = page.locator('canvas');
    const clickPos = { x: 400, y: 300 };
    
    // Click on canvas to paint a cell
    await canvas.click({ position: clickPos });
    await page.waitForTimeout(100);
    
    // Check population increased
    const popText = await page.locator('#info-pop').textContent();
    const pop = parseInt(popText || '0');
    expect(pop).toBeGreaterThan(0);
    
    // Click same spot to erase - need to click exactly on the cell
    await canvas.click({ position: clickPos });
    await page.waitForTimeout(100);
    
    // Check population decreased or stayed same (might be 0)
    const newPopText = await page.locator('#info-pop').textContent();
    const newPop = parseInt(newPopText || '0');
    expect(newPop).toBeLessThanOrEqual(pop);
  });

  test('3. Play/pause simulation advances generations', async ({ page }) => {
    // Paint some cells first
    const canvas = page.locator('canvas');
    await canvas.click({ position: { x: 400, y: 300 } });
    await canvas.click({ position: { x: 420, y: 300 } });
    await canvas.click({ position: { x: 440, y: 300 } });
    
    // Get initial generation
    const initialGenText = await page.locator('#info-gen').textContent();
    const initialGen = parseInt(initialGenText || '0');
    expect(initialGen).toBe(0);
    
    // Click play
    await page.locator('#btn-play').click();
    
    // Wait a bit for simulation to run
    await page.waitForTimeout(500);
    
    // Click pause
    await page.locator('#btn-play').click();
    
    // Check generation advanced
    const newGenText = await page.locator('#info-gen').textContent();
    const newGen = parseInt(newGenText || '0');
    expect(newGen).toBeGreaterThan(0);
  });

  test('4. Pattern placement from dropdown', async ({ page }) => {
    // Click patterns button
    await page.locator('#btn-patterns').click();
    
    // Wait for dropdown to appear
    await expect(page.locator('#patterns-dropdown')).toBeVisible();
    
    // Click on a pattern (Glider)
    await page.locator('#patterns-dropdown').getByRole('button', { name: 'Glider', exact: true }).click();
    
    // Check that placement mode is active (button should show pattern name)
    const patternsButton = await page.locator('#btn-patterns').textContent();
    expect(patternsButton).toContain('Glider');
    
    // Place the pattern
    const canvas = page.locator('canvas');
    await canvas.click({ position: { x: 400, y: 300 } });
    
    // Check population increased (glider has 5 cells)
    const popText = await page.locator('#info-pop').textContent();
    const pop = parseInt(popText || '0');
    expect(pop).toBe(5);
  });

  test('5. Rules modal opens, changes rules, applies', async ({ page }) => {
    // Expand secondary toolbar to access Rules button
    await page.locator('#btn-toggle-more').click();

    // Click rules button
    await page.locator('#btn-rules').click();
    
    // Check modal is visible
    await expect(page.locator('#modal-overlay')).toBeVisible();
    
    // Change rule string
    await page.locator('#rule-string').fill('B36/S23');
    
    // Click apply
    await page.locator('#btn-modal-apply').click();
    
    // Check modal closed
    await expect(page.locator('#modal-overlay')).not.toBeVisible();
    
    // Check rule changed in info bar
    const ruleText = await page.locator('#info-rule').textContent();
    expect(ruleText).toBe('B36/S23');
  });

  test('6. Zoom and pan interactions', async ({ page }) => {
    const canvas = page.locator('canvas');
    
    // Get initial zoom level
    const initialZoomText = await page.locator('#info-zoom').textContent();
    const initialZoom = parseInt(initialZoomText || '100');
    
    // Zoom in with mouse wheel
    await canvas.hover({ position: { x: 400, y: 300 } });
    await page.mouse.wheel(0, -100); // Scroll up to zoom in
    
    // Check zoom increased
    const newZoomText = await page.locator('#info-zoom').textContent();
    const newZoom = parseInt(newZoomText || '100');
    expect(newZoom).toBeGreaterThan(initialZoom);
    
    // Reset view
    await page.locator('#btn-toggle-more').click();
    await page.locator('#btn-reset-view').click();
    
    // Check zoom reset
    const resetZoomText = await page.locator('#info-zoom').textContent();
    const resetZoom = parseInt(resetZoomText || '100');
    expect(resetZoom).toBe(100);
  });

  test('Clear button resets the grid', async ({ page }) => {
    const canvas = page.locator('canvas');
    
    // Paint some cells
    await canvas.click({ position: { x: 400, y: 300 } });
    await canvas.click({ position: { x: 420, y: 300 } });
    
    await page.waitForTimeout(100);
    
    // Check population > 0
    const popText = await page.locator('#info-pop').textContent();
    const pop = parseInt(popText || '0');
    expect(pop).toBeGreaterThan(0);
    
    // Click clear
    await page.locator('#btn-clear').click();
    
    // Check population is 0
    const newPopText = await page.locator('#info-pop').textContent();
    const newPop = parseInt(newPopText || '0');
    expect(newPop).toBe(0);
  });

  test('7. Share button builds URL hash from current state', async ({ page, context }) => {
    const canvas = page.locator('canvas');

    await canvas.click({ position: { x: 400, y: 300 } });
    await canvas.click({ position: { x: 420, y: 300 } });
    await canvas.click({ position: { x: 440, y: 300 } });

    await page.locator('#btn-toggle-more').click();

    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.locator('#btn-share').click();
    await page.waitForTimeout(200);

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toMatch(/^https?:\/\/.+\/#B3\.S23:6ab4ff:\d+:[A-Za-z0-9\-_]+$/);

    await expect(page.locator('#share-toast')).toBeVisible();
  });

  test('8. URL hash restores state on page load', async ({ page }) => {
    await page.goto('/');
    const canvas = page.locator('canvas');

    // Place 5 cells with wide spacing to avoid collisions
    await canvas.click({ position: { x: 200, y: 200 } });
    await canvas.click({ position: { x: 300, y: 200 } });
    await canvas.click({ position: { x: 400, y: 200 } });
    await canvas.click({ position: { x: 500, y: 200 } });
    await canvas.click({ position: { x: 600, y: 200 } });

    const shareHash = await page.evaluate(() => buildShareHash());

    await page.goto('/' + shareHash);
    await page.waitForTimeout(200);

    const popText = await page.locator('#info-pop').textContent();
    const pop = parseInt(popText || '0');
    expect(pop).toBe(5);
  });

  test('Redo stack is capped at 50 entries', async ({ page }) => {
    await page.evaluate(() => {
      for (let i = 0; i < 60; i++) window.saveUndoState();
    });

    const undoLen = await page.evaluate(() => state.undoStack.length);
    expect(undoLen).toBe(50);

    for (let i = 0; i < 50; i++) {
      await page.evaluate(() => window.undo());
    }

    const redoLen = await page.evaluate(() => state.redoStack.length);
    expect(redoLen).toBeLessThanOrEqual(50);
  });

  test('Color picker opens and closes repeatedly without breaking', async ({ page }) => {
    await page.locator('#btn-toggle-more').click();
    const btn = page.locator('#btn-color');
    const dd = page.locator('#color-dropdown');

    for (let i = 0; i < 3; i++) {
      await btn.click();
      await expect(dd).toBeVisible();
      await page.mouse.click(10, 10);
      await expect(dd).not.toBeVisible();
    }

    await btn.click();
    await expect(dd).toBeVisible();
    const wheel = dd.locator('.color-wheel');
    await expect(wheel).toBeVisible();
    const box = await wheel.boundingBox();
    expect(box).not.toBeNull();
  });

  test('9. Pattern discovery finds objects from random soups', async ({ page }) => {
    // Expand secondary toolbar to access Discover button
    await page.locator('#btn-toggle-more').click();

    // Click Discover to start learning
    await page.locator('#btn-discover').click();
    await page.waitForTimeout(200);

    // Verify button shows active state
    await expect(page.locator('#btn-discover')).toHaveClass(/active/);

    // Wait for some discoveries
    await page.waitForTimeout(3000);

    // Stop learning
    await page.locator('#btn-discover').click();

    // Panel should show discoveries and soup count
    const panel = page.locator('#discover-panel');
    await expect(panel).toBeVisible();

    // Should have found at least some objects
    const counterText = await page.locator('.discover-panel .counter').textContent();
    const soups = parseInt(counterText || '0');
    expect(soups).toBeGreaterThan(0);
  });
});
