import test from 'node:test'
import assert from 'node:assert/strict'
import { hasMeaningfulRichText, validateRetrospectiveForCommit } from './period-close'

test('rich text validation ignores empty HTML shells', () => {
  assert.equal(hasMeaningfulRichText('<p><br></p>'), false)
  assert.equal(hasMeaningfulRichText('<p>Delivered the launch</p>'), true)
})

test('commit validation requires achieved, learned, and a supported action', () => {
  assert.equal(validateRetrospectiveForCommit({}), 'What was achieved is required')
  assert.equal(validateRetrospectiveForCommit({ whatWasAchieved: '<p>Done</p>' }), 'What we learned is required')
  assert.equal(validateRetrospectiveForCommit({
    whatWasAchieved: '<p>Done</p>',
    whatWeLearned: '<p>Learned</p>',
    recommendedAction: 'ROLL_FORWARD',
  }), null)
})
