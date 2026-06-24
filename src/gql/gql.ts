/* eslint-disable */
import * as types from './graphql';
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  query ListComments($issueId: String!, $first: Int, $after: String) {\n    issue(id: $issueId) {\n      comments(first: $first, after: $after) {\n        nodes {\n          id\n          body\n          createdAt\n          parentId\n          user {\n            name\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n": typeof types.ListCommentsDocument,
    "\n  query CommentIssueId($id: String!) {\n    comment(id: $id) {\n      issueId\n    }\n  }\n": typeof types.CommentIssueIdDocument,
    "\n  query ListIssues($first: Int, $after: String, $filter: IssueFilter) {\n    issues(first: $first, after: $after, filter: $filter) {\n      nodes {\n        ...IssueFields\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": typeof types.ListIssuesDocument,
    "\n  query MeIssues($first: Int, $after: String, $filter: IssueFilter) {\n    issues(first: $first, after: $after, filter: $filter) {\n      nodes {\n        ...IssueFields\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": typeof types.MeIssuesDocument,
    "\n  query SearchIssues($term: String!, $first: Int, $after: String, $filter: IssueFilter) {\n    searchIssues(term: $term, first: $first, after: $after, filter: $filter) {\n      nodes {\n        identifier\n        title\n        state { name }\n        assignee { displayName }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": typeof types.SearchIssuesDocument,
    "\n  fragment IssueFields on Issue {\n    identifier\n    title\n    state { name }\n    assignee { displayName }\n  }\n": typeof types.IssueFieldsFragmentDoc,
    "\n  query ProjectMilestones($id: String!) {\n    project(id: $id) {\n      projectMilestones {\n        nodes {\n          id\n          name\n        }\n      }\n    }\n  }\n": typeof types.ProjectMilestonesDocument,
};
const documents: Documents = {
    "\n  query ListComments($issueId: String!, $first: Int, $after: String) {\n    issue(id: $issueId) {\n      comments(first: $first, after: $after) {\n        nodes {\n          id\n          body\n          createdAt\n          parentId\n          user {\n            name\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n": types.ListCommentsDocument,
    "\n  query CommentIssueId($id: String!) {\n    comment(id: $id) {\n      issueId\n    }\n  }\n": types.CommentIssueIdDocument,
    "\n  query ListIssues($first: Int, $after: String, $filter: IssueFilter) {\n    issues(first: $first, after: $after, filter: $filter) {\n      nodes {\n        ...IssueFields\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": types.ListIssuesDocument,
    "\n  query MeIssues($first: Int, $after: String, $filter: IssueFilter) {\n    issues(first: $first, after: $after, filter: $filter) {\n      nodes {\n        ...IssueFields\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": types.MeIssuesDocument,
    "\n  query SearchIssues($term: String!, $first: Int, $after: String, $filter: IssueFilter) {\n    searchIssues(term: $term, first: $first, after: $after, filter: $filter) {\n      nodes {\n        identifier\n        title\n        state { name }\n        assignee { displayName }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": types.SearchIssuesDocument,
    "\n  fragment IssueFields on Issue {\n    identifier\n    title\n    state { name }\n    assignee { displayName }\n  }\n": types.IssueFieldsFragmentDoc,
    "\n  query ProjectMilestones($id: String!) {\n    project(id: $id) {\n      projectMilestones {\n        nodes {\n          id\n          name\n        }\n      }\n    }\n  }\n": types.ProjectMilestonesDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query ListComments($issueId: String!, $first: Int, $after: String) {\n    issue(id: $issueId) {\n      comments(first: $first, after: $after) {\n        nodes {\n          id\n          body\n          createdAt\n          parentId\n          user {\n            name\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query ListComments($issueId: String!, $first: Int, $after: String) {\n    issue(id: $issueId) {\n      comments(first: $first, after: $after) {\n        nodes {\n          id\n          body\n          createdAt\n          parentId\n          user {\n            name\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query CommentIssueId($id: String!) {\n    comment(id: $id) {\n      issueId\n    }\n  }\n"): (typeof documents)["\n  query CommentIssueId($id: String!) {\n    comment(id: $id) {\n      issueId\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query ListIssues($first: Int, $after: String, $filter: IssueFilter) {\n    issues(first: $first, after: $after, filter: $filter) {\n      nodes {\n        ...IssueFields\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"): (typeof documents)["\n  query ListIssues($first: Int, $after: String, $filter: IssueFilter) {\n    issues(first: $first, after: $after, filter: $filter) {\n      nodes {\n        ...IssueFields\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MeIssues($first: Int, $after: String, $filter: IssueFilter) {\n    issues(first: $first, after: $after, filter: $filter) {\n      nodes {\n        ...IssueFields\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"): (typeof documents)["\n  query MeIssues($first: Int, $after: String, $filter: IssueFilter) {\n    issues(first: $first, after: $after, filter: $filter) {\n      nodes {\n        ...IssueFields\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SearchIssues($term: String!, $first: Int, $after: String, $filter: IssueFilter) {\n    searchIssues(term: $term, first: $first, after: $after, filter: $filter) {\n      nodes {\n        identifier\n        title\n        state { name }\n        assignee { displayName }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"): (typeof documents)["\n  query SearchIssues($term: String!, $first: Int, $after: String, $filter: IssueFilter) {\n    searchIssues(term: $term, first: $first, after: $after, filter: $filter) {\n      nodes {\n        identifier\n        title\n        state { name }\n        assignee { displayName }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment IssueFields on Issue {\n    identifier\n    title\n    state { name }\n    assignee { displayName }\n  }\n"): (typeof documents)["\n  fragment IssueFields on Issue {\n    identifier\n    title\n    state { name }\n    assignee { displayName }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query ProjectMilestones($id: String!) {\n    project(id: $id) {\n      projectMilestones {\n        nodes {\n          id\n          name\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query ProjectMilestones($id: String!) {\n    project(id: $id) {\n      projectMilestones {\n        nodes {\n          id\n          name\n        }\n      }\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;