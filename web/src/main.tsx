import './styles.css'
import { render } from 'preact'
import { App } from './app'
import { connect, hostToken } from './net'
import { initPrefs } from './prefs'
import './awake'

initPrefs(!!hostToken)
connect()
render(<App />, document.getElementById('app')!)
