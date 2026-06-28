import { graphql } from '../../../gql/gql.js';

export const VIEWER_FAVORITES_QUERY = graphql(`
  query ViewerFavorites {
    favorites {
      nodes {
        id
        type
        issue {
          id
          identifier
        }
      }
    }
  }
`);
