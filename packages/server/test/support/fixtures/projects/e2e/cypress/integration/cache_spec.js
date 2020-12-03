/* eslint-disable
    brace-style,
    no-undef,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
// the goal of what we want to achieve in regards to caching is this
// 1. for internal file server requests, do not cache but do set etags
// 2. for http server requests, respect whatever the 3rd party server sends
// 3. for any kind of cy.visit always force cache-control: no-cache headers

const send = (win) => {
  return new Cypress.Promise((resolve) => {
    const xhr = new win.XMLHttpRequest

    xhr.open('GET', '/static/foo.js')
    xhr.send()

    xhr.onload = () => {
      return resolve({
        body: xhr.response,
        etag: xhr.getResponseHeader('etag'),
        cacheControl: xhr.getResponseHeader('cache-control'),
      })
    }
  })
}

describe('caching', () => {
  it('does not cache cy.visit file server requests', () => {
    return cy
    .request('POST', 'http://localhost:1515/write/hi')
    .visit('/index.html?local')
    .get('h1').should('contain', 'hi')
    .request('POST', 'http://localhost:1515/write/hello')
    .visit('/index.html?local')
    .get('h1').should('contain', 'hello')
  })

  it('sets etags on file assets, but no cache-control', () => {
    return cy
    .writeFile('static/foo.js', 'alert(\'hi\')')
    .visit('/index.html?local')
    .window().then((win) => {
      return send(win)
    }).then((resp1) => {
    // make sure our file server is not telling the browser
    // to cache anything
      expect(resp1.cacheControl).to.eq('public, max-age=0')

      return cy
      .window().then((win) => {
        return send(win)
      }).then((resp2) => {
      // these responses should be identical
        expect(resp1).to.deep.eq(resp2)

        return cy
        // now change our static files' content
        .writeFile('static/foo.js', 'console.log(\'bar\')')
        .window().then((win) => {
          return send(win)
        }).then((resp3) => {
        // etags should now no longer match!
          expect(resp1.etag).not.to.eq(resp3.etag)

          // nor should bodies match
          expect(resp1.body).not.to.eq(resp3.body)

          // but cache control should
          expect(resp1.cacheControl).to.eq(resp3.cacheControl)
        })
      })
    })
  })

  it('does not cache cy.visit http server requests', () => // even though our server sends down cache headers
  // we are explicitly turning them off in the proxy
  // whenever we have to inject new content into the page
  {
    return cy
    .request('POST', 'http://localhost:1515/write/hi')
    .visit('http://localhost:1515/index.html?http')
    .get('h1').should('contain', 'hi')
    .request('POST', 'http://localhost:1515/write/foo')
    .visit('http://localhost:1515/index.html?http')
    .get('h1').should('contain', 'foo')
  })

  it('respects cache control headers from 3rd party http servers', () => {
    return cy
    .writeFile('static/foo.js', 'alert(\'hi\')')
    .visit('http://localhost:1515/index.html?http')
    .window().then((win) => {
      return send(win)
    }).then((resp1) => {
    // we've set express.static to cache assets
      expect(resp1.cacheControl).to.eq('public, max-age=3600')

      return cy
      .window().then((win) => {
        return send(win)
      }).then((resp2) => {
      // these responses should be identical
        expect(resp1).to.deep.eq(resp2)

        return cy
        // now change our static files' content
        .writeFile('static/foo.js', 'console.log(\'bar\')')
        .window().then((win) => {
          return send(win)
        }).then((resp3) => // but because of the cache-control headers
        // our browser should NOT have made a
        // new http request and therefore all of
        // these should still match
        {
          expect(resp1).to.deep.eq(resp3)
        })
      })
    })
  })
})
