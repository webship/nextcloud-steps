@activity
Feature: The activity stream
  As a person working with files
  I want the activity stream to say what happened to them
  So that I follow the changes and the shares

  Scenario: An upload is the newest activity
    Given I am a logged in user with the "user" user
    When I go to the files
    And I upload the file "budget.txt"
    And I go to the activity stream
    Then the newest activity should be "You created budget.txt"

  Scenario: The file changes of the account
    Given "user" has the file "meeting-notes.md"
    And I am a logged in user with the "user" user
    When I go to the activity stream
    And I filter the activity stream by "File changes"
    Then the newest activity should be "You created meeting-notes.md"
    And the activity stream should show "You created meeting-notes.md"

  Scenario: A share is among the file shares
    Given "user" has shared the file "team-photo.png" with "editor"
    And I am a logged in user with the "user" user
    When I go to the activity stream
    And I filter the activity stream by "File shares"
    Then the newest activity should be "You shared team-photo.png with Editor"
