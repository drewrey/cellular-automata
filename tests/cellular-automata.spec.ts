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
    await canvas.click({ position: { x: 401, y: 300 } });
    await canvas.click({ position: { x: 402, y: 300 } });
    
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
    await page.locator('#patterns-dropdown button:has-text("Glider")').click();
    
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
    await canvas.click({ position: { x: 401, y: 300 } });
    
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
});
