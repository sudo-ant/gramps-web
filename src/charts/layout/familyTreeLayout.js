import {extent} from 'd3-array'
import {getFamilyTree, getPrimaryAncestry} from '../model/familyTree.js'

export const familyTreeLayoutDefaults = {
  boxWidth: 190,
  boxHeight: 90,
  partnerGap: 30,
  generationGap: 80,
  siblingGap: 30,
  familyGap: 60,
  padding: 20,
}

const personNode = (data, generation, x, y, key = data.key) => ({
  key,
  handle: data.handle,
  person: data.person,
  generation,
  x,
  y,
})

const withBounds = (layout, {boxWidth, boxHeight, padding}) => {
  if (layout.nodes.length === 0) {
    return {
      ...layout,
      bounds: {xMin: 0, xMax: 0, yMin: 0, yMax: 0},
    }
  }

  const [xMin, xMax] = extent(layout.nodes, node => node.x)
  const [yMin, yMax] = extent(layout.nodes, node => node.y)

  return {
    ...layout,
    bounds: {
      xMin: xMin - boxWidth / 2 - padding,
      xMax: xMax + boxWidth / 2 + padding,
      yMin: yMin - boxHeight / 2 - padding,
      yMax: yMax + boxHeight / 2 + padding,
    },
  }
}

export function layoutFamilyTree(
  graph,
  handle,
  {ancestorDepth = 0, descendantDepth = 1, ...options} = {}
) {
  const settings = {...familyTreeLayoutDefaults, ...options}
  const {
    boxWidth,
    boxHeight,
    partnerGap,
    generationGap,
    siblingGap,
    familyGap,
  } = settings

  const data = getFamilyTree(graph, handle, descendantDepth)
  const ancestry = getPrimaryAncestry(graph, handle, ancestorDepth)
  const nodes = []
  const relationships = []
  const links = []

  const generationStep = boxHeight + generationGap

  const measurePerson = personData => {
    const familyMeasurements = personData.families.map(family => {
      const children = family.children.map(child => ({
        data: child,
        measurement: measurePerson(child),
      }))

      const childrenWidth =
        children.reduce((total, child) => total + child.measurement.width, 0) +
        Math.max(0, children.length - 1) * siblingGap

      const coupleWidth = family.partnerHandle
        ? boxWidth * 2 + partnerGap
        : boxWidth

      return {
        family,
        children,
        childrenWidth,
        width: Math.max(coupleWidth, childrenWidth),
      }
    })

    const familiesWidth =
      familyMeasurements.reduce((total, family) => total + family.width, 0) +
      Math.max(0, familyMeasurements.length - 1) * familyGap

    return {
      width: Math.max(boxWidth, familiesWidth),
      families: familyMeasurements,
    }
  }

  const measurement = measurePerson(data)

  const layoutPerson = (
    personData,
    personMeasurement,
    generation,
    centreX,
    y
  ) => {
    const node = personNode(personData, generation, centreX, y)
    nodes.push(node)

    if (personMeasurement.families.length === 0) {
      return node
    }

    let familyLeft = centreX - personMeasurement.width / 2

    personMeasurement.families.forEach(familyMeasurement => {
      const {family, children, width} = familyMeasurement
      const familyCentre = familyLeft + width / 2

      const partnerX = family.partnerHandle
        ? familyCentre + partnerGap / 2 + boxWidth / 2
        : undefined

      const partner = family.partnerHandle
        ? {
            key: `${family.key}:partner`,
            handle: family.partnerHandle,
            person: family.partner,
            generation,
            x: partnerX,
            y,
          }
        : undefined

      if (partner) {
        nodes.push(partner)
      }

      const relationshipX = partner ? (node.x + partner.x) / 2 : node.x

      const relationship = {
        key: family.key,
        family: family.family,
        person: node,
        partner,
        x: relationshipX,
        y,
      }

      relationships.push(relationship)

      let childLeft = relationshipX - familyMeasurement.childrenWidth / 2

      children.forEach(child => {
        const childCentre = childLeft + child.measurement.width / 2

        const childNode = layoutPerson(
          child.data,
          child.measurement,
          generation - 1,
          childCentre,
          y + generationStep
        )

        links.push({
          key: `${family.key}:child:${child.data.key}`,
          source: relationship,
          target: childNode,
          relationship,
        })

        childLeft += child.measurement.width + siblingGap
      })

      familyLeft += width + familyGap
    })

    return node
  }
  const ancestorWidth = ancestor => {
    if (!ancestor?.parentFamily) {
      return boxWidth
    }

    const fatherWidth = ancestor.parentFamily.father
      ? ancestorWidth(ancestor.parentFamily.father)
      : 0

    const motherWidth = ancestor.parentFamily.mother
      ? ancestorWidth(ancestor.parentFamily.mother)
      : 0

    if (fatherWidth && motherWidth) {
      return Math.max(boxWidth, fatherWidth + partnerGap + motherWidth)
    }

    return Math.max(boxWidth, fatherWidth || motherWidth)
  }

  const layoutAncestorParents = (ancestor, childNode) => {
    if (!ancestor?.parentFamily) {
      return
    }

    const {parentFamily} = ancestor
    const fatherData = parentFamily.father
    const motherData = parentFamily.mother

    const fatherWidth = fatherData ? ancestorWidth(fatherData) : 0
    const motherWidth = motherData ? ancestorWidth(motherData) : 0

    const totalWidth =
      fatherWidth && motherWidth
        ? fatherWidth + partnerGap + motherWidth
        : fatherWidth || motherWidth || boxWidth

    const left = childNode.x - totalWidth / 2
    const parentY = childNode.y - generationStep
    const generation = childNode.generation + 1

    const fatherNode = fatherData
      ? personNode(
          fatherData,
          generation,
          left + fatherWidth / 2,
          parentY,
          `${parentFamily.family.handle}:father:${fatherData.handle}`
        )
      : undefined

    const motherNode = motherData
      ? personNode(
          motherData,
          generation,
          left + fatherWidth + (fatherWidth ? partnerGap : 0) + motherWidth / 2,
          parentY,
          `${parentFamily.family.handle}:mother:${motherData.handle}`
        )
      : undefined

    if (fatherNode) {
      nodes.push(fatherNode)
    }

    if (motherNode) {
      nodes.push(motherNode)
    }

    const relationshipX =
      fatherNode && motherNode
        ? (fatherNode.x + motherNode.x) / 2
        : (fatherNode ?? motherNode).x

    const relationship = {
      key: `${parentFamily.family.handle}:ancestry`,
      family: parentFamily.family,
      person: fatherNode ?? motherNode,
      partner: fatherNode && motherNode ? motherNode : undefined,
      x: relationshipX,
      y: parentY,
    }

    relationships.push(relationship)

    links.push({
      key: `${parentFamily.family.handle}:child:${childNode.handle}:ancestry`,
      source: relationship,
      target: childNode,
      relationship,
    })

    if (fatherNode && fatherData) {
      layoutAncestorParents(fatherData, fatherNode)
    }

    if (motherNode && motherData) {
      layoutAncestorParents(motherData, motherNode)
    }
  }
  const rootNode = layoutPerson(data, measurement, 0, 0, 0)
  layoutAncestorParents(ancestry, rootNode)

  return withBounds({nodes, relationships, links}, settings)
}
