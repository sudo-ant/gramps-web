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

const isPartnerFamily = (family, handle) =>
  family.father_handle === handle || family.mother_handle === handle

const partnerFamilies = (graph, handle) =>
  graph
    .partnerFamilies(handle)
    .filter(family => isPartnerFamily(family, handle))

export const isResolvedFamilyTreePerson = person =>
  Boolean(person?.handle && person?.profile?.gramps_id)

const resolvedPerson = (graph, handle) => {
  const person = graph.person(handle)
  return isResolvedFamilyTreePerson(person) ? person : undefined
}

export const getFamilyTree = (graph, handle, descendantDepth) => {
  const buildPerson = (personHandle, depth, path) => {
    const person = resolvedPerson(graph, personHandle)

    const node = {
      key: path,
      handle: personHandle,
      person,
      depth,
      families: [],
      hiddenDescendantFamilyHandles: [],
      hasHiddenParents: person
        ? graph.parentFamilies(personHandle).length > 0
        : false,
      hasHiddenFamilies: false,
    }

    if (!person) {
      return node
    }

    if (depth >= descendantDepth) {
      node.hiddenDescendantFamilyHandles = partnerFamilies(graph, personHandle)
        .map(family => family.handle)
        .filter(Boolean)
      node.hasHiddenFamilies = node.hiddenDescendantFamilyHandles.length > 0
      return node
    }

    // The API's family-list order is the only stable primary-partnership
    // ordering available here. Ignore any parent-family record that is
    // accidentally present in that list.
    node.families = partnerFamilies(graph, personHandle).map(
      (family, familyIndex) => {
        const partnerHandle = otherPartnerHandle(family, personHandle)

        return {
          key: `${path}f${familyIndex}`,
          family,
          partnerHandle,
          partner: partnerHandle
            ? resolvedPerson(graph, partnerHandle)
            : undefined,
          children: [
            ...new Set((family.child_ref_list ?? []).map(ref => ref.ref)),
          ]
            .filter(
              childHandle =>
                graph.childRelationships(family, childHandle).length
            )
            .map((childHandle, childIndex) => ({
              ...buildPerson(
                childHandle,
                depth + 1,
                `${path}f${familyIndex}c${childIndex}`
              ),
              parentRelationships: graph.childRelationships(
                family,
                childHandle
              ),
            })),
        }
      }
    )

    return node
  }

  return buildPerson(handle, 0, 'p')
}

// Primary-first ancestry, retaining other recorded parent families too.
export const getPrimaryAncestry = (graph, handle, ancestorDepth) => {
  const buildPerson = (
    personHandle,
    depth,
    path,
    descendantFamilyHandle = ''
  ) => {
    const person = resolvedPerson(graph, personHandle)
    const parentFamilies = person
      ? graph
          .parentFamilies(personHandle)
          .filter(
            family => graph.childRelationships(family, personHandle).length
          )
      : []
    const primaryFamily = parentFamilies[0]
    const sideFamilies =
      person && depth > 0
        ? graph
            .partnerFamilies(personHandle)
            .filter(family => isPartnerFamily(family, personHandle))
            .filter(family => family.handle !== descendantFamilyHandle)
            .map((family, familyIndex) => {
              const partnerHandle = otherPartnerHandle(family, personHandle)
              return {
                key: `${path}side${familyIndex}`,
                family,
                partnerHandle,
                partner: partnerHandle
                  ? resolvedPerson(graph, partnerHandle)
                  : undefined,
                children: [],
              }
            })
        : []

    const node = {
      key: path,
      handle: personHandle,
      person,
      depth,
      parentFamily: undefined,
      parentFamilies: [],
      sideFamilies,
      hiddenAncestorFamilyHandles: [],
      hasAdditionalParentFamilies: parentFamilies.length > 1,
      hasHiddenPrimaryParents: false,
    }

    if (!person || !primaryFamily) {
      return node
    }

    if (depth >= ancestorDepth) {
      node.hiddenAncestorFamilyHandles = parentFamilies.map(
        family => family.handle
      )
      node.hasHiddenPrimaryParents = true
      return node
    }

    node.parentFamilies = parentFamilies.map((family, familyIndex) => {
      const relations = graph.childRelationships(family, personHandle)
      const pathPrefix = familyIndex ? `${path}family${familyIndex}` : path
      const father = relations.find(relation => relation.role === 'father')
      const mother = relations.find(relation => relation.role === 'mother')
      return {
        family,
        parentRelationships: relations,
        father: father
          ? buildPerson(
              father.handle,
              depth + 1,
              `${pathPrefix}father`,
              family.handle
            )
          : undefined,
        mother: mother
          ? buildPerson(
              mother.handle,
              depth + 1,
              `${pathPrefix}mother`,
              family.handle
            )
          : undefined,
      }
    })
    ;[node.parentFamily] = node.parentFamilies

    return node
  }

  return buildPerson(handle, 0, 'a')
}
