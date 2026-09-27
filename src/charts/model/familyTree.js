// Builds a family-aware tree model for the Family Tree chart.
//
// Unlike the existing descendant hierarchy, this keeps partner families
// separate so children remain associated with the correct relationship.

const otherPartnerHandle = (family, handle) => {
  if (family.father_handle === handle) {
    return family.mother_handle || ''
  }
  if (family.mother_handle === handle) {
    return family.father_handle || ''
  }
  return ''
}

const birthChildren = (family, parentHandle) => {
  const relationKey =
    family.father_handle === parentHandle
      ? 'frel'
      : family.mother_handle === parentHandle
      ? 'mrel'
      : undefined

  if (!relationKey) {
    return []
  }

  return (family.child_ref_list ?? [])
    .filter(childRef => childRef[relationKey] === 'Birth')
    .map(childRef => childRef.ref)
}

export const getFamilyTree = (graph, handle, descendantDepth) => {
  const buildPerson = (personHandle, depth, path) => {
    const person = graph.person(personHandle)

    const node = {
      key: path,
      handle: personHandle,
      person,
      depth,
      families: [],
      hasHiddenParents: person
        ? graph.parentFamilies(personHandle).length > 0
        : false,
      hasHiddenFamilies: false,
    }

    if (!person) {
      return node
    }

    if (depth >= descendantDepth) {
      node.hasHiddenFamilies = graph.partnerFamilies(personHandle).length > 0
      return node
    }

    node.families = graph
      .partnerFamilies(personHandle)
      .map((family, familyIndex) => {
        const partnerHandle = otherPartnerHandle(family, personHandle)

        return {
          key: `${path}f${familyIndex}`,
          family,
          partnerHandle,
          partner: partnerHandle ? graph.person(partnerHandle) : undefined,
          children: birthChildren(family, personHandle).map(
            (childHandle, childIndex) =>
              buildPerson(
                childHandle,
                depth + 1,
                `${path}f${familyIndex}c${childIndex}`
              )
          ),
        }
      })

    return node
  }

  return buildPerson(handle, 0, 'p')
}

export const getPrimaryAncestry = (graph, handle, ancestorDepth) => {
  const buildPerson = (personHandle, depth, path) => {
    const person = graph.person(personHandle)
    const parentFamilies = person ? graph.parentFamilies(personHandle) : []
    const primaryFamily = parentFamilies[0]

    const node = {
      key: path,
      handle: personHandle,
      person,
      depth,
      parentFamily: undefined,
      hasAdditionalParentFamilies: parentFamilies.length > 1,
      hasHiddenPrimaryParents: false,
    }

    if (!person || !primaryFamily) {
      return node
    }

    if (depth >= ancestorDepth) {
      node.hasHiddenPrimaryParents = true
      return node
    }

    node.parentFamily = {
      family: primaryFamily,
      father: primaryFamily.father_handle
        ? buildPerson(primaryFamily.father_handle, depth + 1, `${path}father`)
        : undefined,
      mother: primaryFamily.mother_handle
        ? buildPerson(primaryFamily.mother_handle, depth + 1, `${path}mother`)
        : undefined,
    }

    return node
  }

  return buildPerson(handle, 0, 'a')
}
