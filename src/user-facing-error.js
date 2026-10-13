// Keep diagnostics in the console; UI text must explain what users can do.
export function explainUserError(error,context='操作'){
  const message=String(error?.message||error||'');
  if(/can't find variable|is not defined|undefined is not an object/i.test(message))
    return `${context}遇到程序错误，请刷新后重试；若持续出现，请反馈给开发者。`;
  if(/(?:blob:|\bblob\b|createobjecturl|arraybuffer|decode.*image|image.*decode)/i.test(message))
    return `${context}时图片读取或解码失败。原始资料仍会保留，请重新打开页面后重试。`;
  if(/webassembly|wasm|opencv|expected magic word/i.test(message))
    return `${context}所需的图像识别组件未能加载，请联网刷新后重试。`;
  if(/failed to fetch|networkerror|load failed|network request failed/i.test(message))
    return `${context}时网络连接中断，请检查网络后重试。`;
  if(/[\u4e00-\u9fff]/.test(message))return message.replace(/sk-[A-Za-z0-9_-]+/g,'[已隐藏]');
  return `${context}暂未完成，请重试；若持续出现，请反馈给开发者。`;
}
