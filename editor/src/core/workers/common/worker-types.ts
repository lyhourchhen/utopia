import { ProjectContentTreeRoot } from '../../../components/assets'
import { TypeDefinitions } from '../../shared/npm-dependency-types'
import { TextFile, ParseSuccess } from '../../shared/project-file-types'
import { ParseOrPrint } from '../parser-printer/parser-printer-worker'

export type FileContent = string | TextFile

export interface UtopiaTsWorkers {
  sendInitMessage: (
    typeDefinitions: TypeDefinitions,
    projectContent: ProjectContentTreeRoot,
  ) => void
  sendUpdateFileMessage: (filename: string, content: FileContent, emitBuild: boolean) => void
  sendParsePrintMessage: (files: Array<ParseOrPrint>) => void
  sendLinterRequestMessage: (filename: string, content: string) => void
  addBundleResultEventListener: (handler: (e: MessageEvent) => void) => void
  removeBundleResultEventListener: (handler: (e: MessageEvent) => void) => void
  addParserPrinterEventListener: (handler: (e: MessageEvent) => void) => void
  removeParserPrinterEventListener: (handler: (e: MessageEvent) => void) => void
  addLinterResultEventListener: (handler: (e: MessageEvent) => void) => void
  removeLinterResultEventListener: (handler: (e: MessageEvent) => void) => void
  initWatchdogWorker(projectID: string): void
  addHeartbeatRequestEventListener(handler: (e: MessageEvent) => void): void
  sendHeartbeatResponseMessage: (id: NodeJS.Timer, projectId: string, safeMode: boolean) => void
}
