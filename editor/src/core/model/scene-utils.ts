import * as Hash from 'object-hash'
import {
  SceneMetadata,
  StaticElementPath,
  PropertyPath,
  isTextFile,
  isParseSuccess,
} from '../shared/project-file-types'
import {
  UtopiaJSXComponent,
  utopiaJSXComponent,
  jsxElement,
  JSXElement,
  jsxAttributeValue,
  isJSXElement,
  JSXElementChild,
  TopLevelElement,
  isUtopiaJSXComponent,
  JSXAttributes,
  defaultPropsParam,
  jsxAttributeOtherJavaScript,
  ElementInstanceMetadataMap,
  jsxAttributesFromMap,
  ElementInstanceMetadata,
} from '../shared/element-template'
import * as EP from '../shared/element-path'
import * as PP from '../shared/property-path'
import {
  eitherToMaybe,
  applicative5Either,
  flatMapEither,
  isLeft,
  applicative6Either,
  right,
} from '../shared/either'
import { memoize } from '../shared/memoize'
import * as fastDeepEqual from 'fast-deep-equal'
import {
  getModifiableJSXAttributeAtPath,
  jsxSimpleAttributeToValue,
} from '../shared/jsx-attributes'
import { stripNulls } from '../shared/array-utils'
import { isPercentPin } from 'utopia-api'
import { UTOPIA_UIDS_KEY } from './utopia-constants'
import { getUtopiaID } from './element-template-utils'
import { emptyComments } from '../workers/parser-printer/parser-printer-comments'
import { getContentsTreeFileFromString, ProjectContentTreeRoot } from '../../components/assets'
import { getUtopiaJSXComponentsFromSuccess } from './project-file-utils'
import { generateConsistentUID, generateUID } from '../shared/uid-utils'
import { emptySet } from '../shared/set-utils'

export const PathForSceneComponent = PP.create(['component'])
export const PathForSceneDataUid = PP.create(['data-uid'])
export const PathForSceneDataLabel = PP.create(['data-label'])
export const PathForSceneFrame = PP.create(['style'])

export const BakedInStoryboardUID = 'utopia-storyboard-uid'
export const BakedInStoryboardVariableName = 'storyboard'

export const EmptyUtopiaCanvasComponent = convertScenesToUtopiaCanvasComponent([])

export const PathForSceneProps = PP.create(['props'])
export const PathForSceneStyle = PP.create(['style'])

export const ResizesContentProp = 'resizeContent'
export const PathForResizeContent = PP.create([ResizesContentProp])

export function createSceneUidFromIndex(sceneIndex: number): string {
  return `scene-${sceneIndex}`
}

export function mapScene(scene: SceneMetadata): JSXElement {
  const sceneProps = jsxAttributesFromMap({
    component: jsxAttributeOtherJavaScript(
      scene.component ?? 'null',
      `return ${scene.component}`,
      [],
      null,
      {},
    ),
    props: jsxAttributeValue(scene.props, emptyComments),
    style: jsxAttributeValue(scene.frame, emptyComments),
    'data-uid': jsxAttributeValue(scene.uid, emptyComments),
    'data-label': jsxAttributeValue(scene.label, emptyComments),
  })
  return jsxElement('Scene', scene.uid, sceneProps, [])
}

export function unmapScene(element: JSXElementChild): SceneMetadata | null {
  if (!isJSXElement(element) || element.name.baseVariable !== 'Scene') {
    return null
  }
  return eitherToMaybe(
    applicative6Either(
      (component, props, style, label, uid) => {
        const scene: SceneMetadata = {
          uid: uid,
          component: component,
          props: props,
          frame: style,
          ...(label == null ? {} : { label: label }),
        }
        return scene
      },
      getSimpleAttributeAtPathCustom(element.props, PP.create(['component'])),
      getSimpleAttributeAtPathCustom(element.props, PP.create(['props'])),
      getSimpleAttributeAtPathCustom(element.props, PP.create(['style'])),
      getSimpleAttributeAtPathCustom(element.props, PP.create(['layout'])),
      getSimpleAttributeAtPathCustom(element.props, PP.create(['data-label'])),
      getSimpleAttributeAtPathCustom(element.props, PP.create(['data-uid'])),
    ),
  )
}

export function convertScenesToUtopiaCanvasComponent(
  scenes: Array<SceneMetadata>,
): UtopiaJSXComponent
export function convertScenesToUtopiaCanvasComponent(scenes: null): null
export function convertScenesToUtopiaCanvasComponent(
  scenes: Array<SceneMetadata> | null,
): UtopiaJSXComponent | null
export function convertScenesToUtopiaCanvasComponent(
  scenes: Array<SceneMetadata> | null,
): UtopiaJSXComponent | null {
  if (scenes == null) {
    return null
  }
  return utopiaJSXComponent(
    BakedInStoryboardVariableName,
    false,
    'var',
    'block',
    null,
    [],
    jsxElement(
      'Storyboard',
      BakedInStoryboardUID,
      jsxAttributesFromMap({ 'data-uid': jsxAttributeValue(BakedInStoryboardUID, emptyComments) }),
      scenes.map(mapScene),
    ),
    null,
    false,
    emptyComments,
  )
}

export function createSceneFromComponent(
  filePath: string,
  componentImportedAs: string,
  uid: string,
): JSXElement {
  const sceneProps = jsxAttributesFromMap({
    [UTOPIA_UIDS_KEY]: jsxAttributeValue(uid, emptyComments),
    style: jsxAttributeValue(
      {
        position: 'absolute',
        left: 0,
        top: 0,
        width: 375,
        height: 812,
      },
      emptyComments,
    ),
  })
  const hash = Hash({
    fileName: filePath,
    name: componentImportedAs,
    props: jsxAttributesFromMap({}),
  })
  const componentUID = generateConsistentUID(emptySet(), hash)
  return jsxElement('Scene', uid, sceneProps, [
    jsxElement(
      componentImportedAs,
      componentUID,
      jsxAttributesFromMap({
        [UTOPIA_UIDS_KEY]: jsxAttributeValue(componentUID, emptyComments),
      }),
      [],
    ),
  ])
}

export function createStoryboardElement(scenes: Array<JSXElement>, uid: string): JSXElement {
  const storyboardProps = jsxAttributesFromMap({
    [UTOPIA_UIDS_KEY]: jsxAttributeValue(uid, emptyComments),
  })
  return jsxElement('Storyboard', uid, storyboardProps, scenes)
}

export function convertUtopiaCanvasComponentToScenes(
  utopiaCanvasComponent: UtopiaJSXComponent | null,
): Array<SceneMetadata> | null {
  if (utopiaCanvasComponent == null) {
    return null
  }
  const rootElement = utopiaCanvasComponent.rootElement
  if (!isJSXElement(rootElement) || rootElement.name.baseVariable !== 'Storyboard') {
    throw new Error('the root element must be a Storyboard component')
  }
  const firstChildrenScenes: Array<SceneMetadata> = stripNulls(rootElement.children.map(unmapScene))
  return firstChildrenScenes
}

const convertScenesAndTopLevelElementsToUtopiaCanvasComponentMemoized = memoize(
  (scenes: Array<SceneMetadata>, topLevelElements: Array<TopLevelElement>) => [
    ...topLevelElements,
    convertScenesToUtopiaCanvasComponent(scenes),
  ],
  { equals: fastDeepEqual }, // delete me as soon as possible
)

export function convertScenesAndTopLevelElementsToUtopiaCanvasComponent(
  scenes: Array<SceneMetadata>,
  topLevelElements: Array<UtopiaJSXComponent>,
): Array<UtopiaJSXComponent>
export function convertScenesAndTopLevelElementsToUtopiaCanvasComponent(
  scenes: Array<SceneMetadata>,
  topLevelElements: Array<TopLevelElement>,
): Array<TopLevelElement>
export function convertScenesAndTopLevelElementsToUtopiaCanvasComponent(
  scenes: Array<SceneMetadata>,
  topLevelElements: Array<TopLevelElement>,
): Array<TopLevelElement> {
  return convertScenesAndTopLevelElementsToUtopiaCanvasComponentMemoized(scenes, topLevelElements)
}

export function fishOutUtopiaCanvasFromTopLevelElements(
  topLevelElements: Array<TopLevelElement>,
): UtopiaJSXComponent | null {
  return (
    topLevelElements.find((e): e is UtopiaJSXComponent => {
      return isUtopiaJSXComponent(e) && e.name === BakedInStoryboardVariableName
    }) ?? null
  )
}

function getSimpleAttributeAtPathCustom(attributes: JSXAttributes, path: PropertyPath) {
  const getAttrResult = getModifiableJSXAttributeAtPath(attributes, path)
  return flatMapEither((attr) => {
    const simpleValue = jsxSimpleAttributeToValue(attr)
    if (isLeft(simpleValue) && attr.type === 'ATTRIBUTE_OTHER_JAVASCRIPT') {
      return right(attr.javascript)
    } else {
      return simpleValue
    }
  }, getAttrResult)
}

export function sceneMetadata(
  uid: string,
  component: string | null,
  props: { [key: string]: any },
  frame: {
    left: number
    top: number
    width: number
    height: number
  },
  label?: string,
): SceneMetadata {
  let scene: SceneMetadata = {
    uid: uid,
    component: component,
    frame: frame,
    props: props,
  }

  if (label != null) {
    // This is annoying, but if we don't do this then we'll explicitly print
    // `undefined` in the label field, meaning the JSON won't parse
    scene.label = label
  }

  return scene
}

export function isSceneElementIgnoringImports(element: JSXElement): boolean {
  // TODO SCENES, how to decide if something is a scene?
  return element.name.baseVariable === 'Scene'
}

export function isSceneChildWidthHeightPercentage(
  scene: ElementInstanceMetadata,
  metadata: ElementInstanceMetadataMap,
): boolean {
  // FIXME ASAP This is reproducing logic that should stay in MetadataUtils, but importing that
  // imports the entire editor into the worker threads, including modules that require window and document
  const rootElements = scene.rootElements.map((path) => metadata[EP.toString(path)])
  const rootElementSizes = rootElements.map((element) => {
    return {
      width: element.props?.style?.width,
      height: element.props?.style?.height,
    }
  })

  return rootElementSizes.some((size) => isPercentPin(size.width) || isPercentPin(size.height))
}

export function isDynamicSceneChildWidthHeightPercentage(
  scene: ElementInstanceMetadata,
  metadata: ElementInstanceMetadataMap,
): boolean {
  const isDynamicScene: boolean = scene.props[ResizesContentProp] ?? false

  return isDynamicScene && isSceneChildWidthHeightPercentage(scene, metadata)
}

export function getStoryboardUID(openComponents: UtopiaJSXComponent[]): string | null {
  const possiblyStoryboard = openComponents.find(
    (component) => component.name === BakedInStoryboardVariableName,
  )
  if (possiblyStoryboard != null) {
    return getUtopiaID(possiblyStoryboard.rootElement)
  }
  return null
}

export function getStoryboardElementPath(
  projectContents: ProjectContentTreeRoot,
  openFile: string | null,
): StaticElementPath | null {
  if (openFile != null) {
    const file = getContentsTreeFileFromString(projectContents, openFile)
    if (isTextFile(file) && isParseSuccess(file.fileContents.parsed)) {
      const possiblyStoryboard = getUtopiaJSXComponentsFromSuccess(file.fileContents.parsed).find(
        (component) => component.name === BakedInStoryboardVariableName,
      )
      if (possiblyStoryboard != null) {
        const uid = getUtopiaID(possiblyStoryboard.rootElement)
        return EP.elementPath([EP.staticElementPath([uid])])
      }
    }
  }
  return null
}
