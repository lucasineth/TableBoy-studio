import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    'playwright-module': { type: 'string' },
    executable: { type: 'string' }
  }
})
const { _electron } = values['playwright-module']
  ? await import(pathToFileURL(resolve(values['playwright-module'])).href)
  : await import('playwright-core')
const fixtureDirectory = await mkdtemp(resolve(tmpdir(), 'tableboy-production-'))
const eightBitPath = resolve(fixtureDirectory, 'unicode-8.tbl')
const sixteenBitPath = resolve(fixtureDirectory, 'unicode-16.tbl')
const malformedPath = resolve(fixtureDirectory, 'malformed.tbl')
await writeFile(malformedPath, 'GG=invalid', 'utf8')
await mkdir('docs/validation', { recursive: true })
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const desktop = await _electron.launch({
  executablePath: values.executable
    ? resolve(values.executable)
    : resolve('node_modules/electron/dist/electron.exe'),
  args: [
    ...(values.executable ? [] : ['.']),
    `--user-data-dir=${resolve(fixtureDirectory, 'profile')}`
  ],
  env,
  timeout: 30_000
})
const checks = []
const errors = []
const check = (label) => {
  checks.push(label)
  console.log(`PASS ${label}`)
}
try {
  const page = await desktop.firstWindow()
  page.on('pageerror', (error) => errors.push(error.message))
  await page.locator('[data-address="00"]').waitFor()
  const cell = (address) => page.locator(`[data-address="${address}"]`)
  const waitValue = async (address, value) => {
    await page.waitForFunction(
      ({ address, value }) =>
        document.querySelector(`[data-address="${address}"]`)?.value === value,
      { address, value }
    )
  }
  const clickAction = (name) => page.getByRole('button', { name, exact: true }).click()
  const waitSaved = () => page.waitForFunction(() => !document.title.includes(' *'))
  await desktop.evaluate(
    ({ dialog }, config) => {
      // Only native dialog choices are automated. Real preload, IPC and disk writes remain active.
      globalThis.__tableboyVerification = {
        savePath: config.eightBitPath,
        openPath: config.eightBitPath,
        response: 1
      }
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: globalThis.__tableboyVerification.savePath
      })
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [globalThis.__tableboyVerification.openPath]
      })
      dialog.showMessageBox = async () => ({
        response: globalThis.__tableboyVerification.response,
        checkboxChecked: false
      })
    },
    { eightBitPath }
  )
  const choices = (settings) =>
    desktop.evaluate((_electron, settings) => {
      Object.assign(globalThis.__tableboyVerification, settings)
    }, settings)

  assert.equal(await cell('00').inputValue(), '')
  assert.equal(await page.locator('[data-address]').count(), 256)
  assert.match(await page.title(), /Untitled\.tbl/)
  assert.deepEqual(
    await page.evaluate(() => ({
      files: typeof window.tableFiles?.save,
      search: typeof window.searchAPI,
      binary: typeof window.binaryDocuments,
      node: typeof window.require
    })),
    { files: 'function', search: 'undefined', binary: 'undefined', node: 'undefined' }
  )
  assert.equal(await page.getByText('Text Search', { exact: true }).count(), 0)
  assert.equal(await page.getByText('Text Browser', { exact: true }).count(), 0)
  for (const menu of ['File', 'Tools']) {
    await clickAction(menu)
    assert.doesNotMatch(await page.getByRole('menu').innerText(), /ROM|Binary|Text Search/)
    await page.keyboard.press('Escape')
  }
  assert.equal(
    await desktop.evaluate(
      ({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences().sandbox
    ),
    true
  )
  check('Empty startup, 256 cells, sandboxed table IPC and no ROM tools or APIs')

  await cell('41').fill('A')
  await cell('F1').fill('ã')
  await cell('FF').fill('[END]')
  await clickAction('Save')
  await waitSaved()
  assert.equal(await readFile(eightBitPath, 'utf8'), '41=A\nF1=ã\nFF=[END]')
  check('8-bit Unicode/tokens save through the real preload and IPC to UTF-8 on disk')

  await cell('41').fill('B')
  await clickAction('Undo')
  await waitValue('41', 'A')
  await clickAction('Redo')
  await waitValue('41', 'B')
  await choices({ response: 2 })
  await clickAction('New')
  await waitValue('41', 'B')
  assert.match(await page.title(), /unicode-8\.tbl \*/)
  await choices({ response: 0 })
  await clickAction('New')
  await waitValue('41', '')
  assert.match(await readFile(eightBitPath, 'utf8'), /41=B/)
  check('Undo/Redo plus Cancel and Save decisions protect unsaved changes on New')

  await clickAction('Open')
  await waitValue('F1', 'ã')
  await choices({ openPath: malformedPath })
  await clickAction('Open')
  await page.getByRole('status').filter({ hasText: 'Could not open' }).waitFor()
  assert.equal(await cell('41').inputValue(), 'B')
  check('Opening restores saved values; malformed files leave the current table intact')

  await clickAction('New')
  await waitValue('41', '')
  await page.getByLabel('Table mode', { exact: true }).selectOption('16-bit')
  await cell('0000').waitFor()
  const pageInput = page.getByLabel('Hexadecimal table page')
  await pageInput.fill('81')
  await pageInput.press('Enter')
  await cell('8140').fill('あ')
  await cell('8141').fill('い')
  await choices({ savePath: sixteenBitPath })
  await clickAction('Save')
  await waitSaved()
  assert.equal(await readFile(sixteenBitPath, 'utf8'), '8140=あ\n8141=い')
  await choices({ openPath: sixteenBitPath })
  await clickAction('New')
  await cell('00').waitFor()
  await clickAction('Open')
  await waitValue('8140', 'あ')
  assert.equal(await page.getByLabel('Table mode', { exact: true }).inputValue(), '16-bit')
  assert.equal(await page.locator('[data-address]').count(), 256)
  check(
    '16-bit page 81 saves and reopens Japanese characters with full keys and 256 rendered cells'
  )

  await cell('8142').click({ button: 'right' })
  const catalog = page.getByRole('menu', { name: /Character catalog/ })
  await catalog.waitFor()
  const category = catalog
    .getByRole('menuitem')
    .filter({ hasText: /Latin.*Uppercase|Uppercase.*Latin/i })
    .first()
  if (await category.count()) await category.click()
  else await catalog.locator('button[aria-haspopup="dialog"]').first().click()
  const picker = page.locator('.character-picker')
  const chosenCharacter = await picker.locator('.character-option').first().innerText()
  await picker.locator('.character-option').first().click()
  await waitValue('8142', chosenCharacter)
  assert.equal(await cell('8141').inputValue(), 'い')
  assert.equal(await cell('8143').inputValue(), '')
  check('Character catalog changes only the selected 16-bit cell')

  await page.keyboard.press('Control+f')
  const search = page.getByRole('searchbox', { name: 'Search table' })
  await search.fill('8140')
  await search.press('Enter')
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-address') === '8140')
  await page.keyboard.press('F1')
  await page.getByRole('dialog', { name: 'Keyboard Shortcuts' }).waitFor()
  await page.keyboard.press('Escape')
  await page.screenshot({ path: 'docs/validation/table-editor-1.5.0.png' })
  check('Ctrl+F selects a full 16-bit address and F1 opens the shortcuts dialog')

  await choices({ response: 2 })
  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  await waitValue('8142', chosenCharacter)
  assert.equal(
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
    1
  )
  check('Cancel on window close preserves the dirty document')

  assert.deepEqual(errors, [])
  check('No renderer exceptions')
  await writeFile(
    'docs/validation/desktop-check.json',
    JSON.stringify(
      {
        executable: values.executable
          ? basename(values.executable)
          : 'electron development runtime',
        version: '1.5.0',
        timestamp: new Date().toISOString(),
        checks,
        errors,
        note: 'Native dialog choices are automated; application UI, sandbox, preload, IPC and filesystem are real.'
      },
      null,
      2
    ) + '\n'
  )
} finally {
  await desktop
    .evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) window.destroy()
    })
    .catch(() => {})
  await desktop.close()
}
