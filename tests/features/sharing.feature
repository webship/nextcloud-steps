@sharing
Feature: Sharing
  As a person working with others
  I want to share a file with another account, and send a public link with a password and an end date
  So that the right people, and only them, reach it

  Scenario: A file is shared with an account, who finds it shared with them
    Given "user" has the file "meeting-notes.md"
    And I am a logged in user with the "user" user
    When I go to the files
    And I share "meeting-notes.md" with "editor" as "View only"
    Then "meeting-notes.md" should be shared with "editor" as "View only"
    Given I am a logged in user with the "editor" user
    When I open the "Shared with you" files view
    Then the file list should show "meeting-notes.md"

  Scenario: A file shared as test data reaches the other account
    Given "user" has shared the file "team-photo.png" with "editor"
    And I am a logged in user with the "editor" user
    When I open the "Shared with you" files view
    Then the file list should show "team-photo.png"

  Scenario: A public link with a password and an expiration date, opened by a visitor
    Given "user" has the file "team-photo.png"
    And I am a logged in user with the "user" user
    When I go to the files
    And I create a public link for "team-photo.png"
    And I protect the public link of "team-photo.png" with the password "Webship-Share-2026"
    And I set the public link of "team-photo.png" to expire in 30 days
    Then the public link of "team-photo.png" should expire in 30 days
    When I open the public link of "team-photo.png" as a visitor
    Then I should be asked for the password of the share
    When I enter the share password "Wrong-password-1"
    Then the share password should be refused
    When I enter the share password "Webship-Share-2026"
    Then the shared file "team-photo.png" should be shown
    And I should not be logged in
