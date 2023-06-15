const WORKER_CODE = () => {
  // eslint-disable-next-line no-restricted-globals
  self.onmessage = (msg: MessageEvent<(Blob | null)[]>) => {
    const resp = msg.data

    Promise.all(resp.map(buf => buf && createImageBitmap(buf))).then(result => postMessage(result))
  }
}

let code = WORKER_CODE.toString()
code = code.substring(code.indexOf('{') + 1, code.lastIndexOf('}'))

const blob = new Blob([code], { type: 'application/javascript' })

export const WORKER = URL.createObjectURL(blob)
