import compareVersions from 'compare-versions'
const path = nova.path
const fs = nova.fs
let process

class CompletionProvider {
  constructor() {
    // create and start TabNine process
    const binaryPath = this.getBinaryPath()
    this.process = new Process(binaryPath, {
      stdio: 'pipe',
      shell: true,
    })
    this.reader = this.process.onStdout(this.onStdout, this)
    this.version = this.getVersion()
    this.writer = this.process.stdin.getWriter()
    // call these to resolve or reject the currently active completion
    this.resolve = null
    this.reject = null
    this.currentCompletionContext = null
    this.process.start()
  }

  provideCompletionItems(editor, context) {
    this.currentCompletionContext = context
    const promise = new Promise((res, rej) => {
      this.resolve = res
      this.reject = rej
    })

    // get document strings
    const cursorPosition = context.position
    const document = editor.document
    // TODO: truncate text if too long
    // text before cursor
    const before = document.getTextInRange(new Range(0, cursorPosition))
    // text after cursor
    const after = document.getTextInRange(
      new Range(cursorPosition, document.length - 1)
    )

    // construct request
    const request = JSON.stringify({
      version: this.version,
      request: {
        Autocomplete: {
          before,
          after,
          region_includes_beginning: true,
          region_includes_end: true,
          filename: document.path,
        },
      },
    })

    // write to TabNine when ready
    this.writer.ready.then(() => {
      this.writer.write(request)
      this.writer.write('\n')
    })
    return promise
  }

  onStdout(response) {
    // we got a response from TabNine, return it as CompletionItems
    const result = JSON.parse(response)
    if (result.results) {
      const completionItems = result.results.map((item) => {
        const completionItem = new CompletionItem(
          item.new_prefix + item.new_suffix,
          CompletionItemKind.Color // no fitting kind to use
        )
        // insert completion before cursor
        completionItem.insertText = item.new_prefix
        // insert completion after cursor
        completionItem.additionalTextEdits = [
          TextEdit.insert(
            this.currentCompletionContext.position,
            item.new_suffix
          ),
        ]
        completionItem.documentation = result.user_message.join(' ')
        completionItem.detail = 'TabNine ' + (item.detail || '')
        return completionItem
      })
      this.resolve(completionItems)
    } else {
      this.reject(new Error('No TabNine response'))
    }
  }

  getBinaryDir() {
    return path.normalize(path.join(__dirname, '..', 'binaries'))
  }

  getBinaryPath() {
    const binaryDir = this.getBinaryDir()
    const latestVersion = this.getVersion()
    const binaryName = 'x86_64-apple-darwin/TabNine'
    const binPath = path.join(binaryDir, latestVersion, binaryName)
    return binPath
  }

  getVersion() {
    const binaryDir = this.getBinaryDir()
    const versions = fs.listdir(binaryDir)
    const sortedVersions = versions.sort(compareVersions)
    const latestVersion = sortedVersions[sortedVersions.length - 1]
    return latestVersion
  }

  destroy() {
    console.log('destroy CompletionProvider')
    this.reader.dispose()
    this.process.kill()
  }
}

export default CompletionProvider