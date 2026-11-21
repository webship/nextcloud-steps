@must-fail
Feature: Assertions that must fail: search, notifications, activity, settings and accounts
  Each scenario asserts something that is not true on the test site. Its last step must fail, with the message its
  description announces and a hint; the steps before it pass. tests/check-must-fail.js runs them.

  Scenario: A file the unified search does not find
    Fails with: The unified search did not find "budget.txt" in "Files".
    Given "user" has the file "team-photo.png"
    And I am a logged in user with the "user" user
    When I search for "team" in the unified search
    Then the unified search should find "budget.txt" in "Files"

  Scenario: A notification that is not there
    Fails with: The notifications do not show "Server maintenance tonight".
    Given "user" has the notification "Quarterly review is due"
    And I am a logged in user with the "user" user
    When I open the notifications
    Then the notifications should show "Server maintenance tonight"

  Scenario: Another newest activity
    Fails with: The newest activity is "You created budget.txt", not "You deleted budget.txt".
    Given "user" has the file "budget.txt"
    And I am a logged in user with the "user" user
    When I go to the activity stream
    Then the newest activity should be "You deleted budget.txt"

  Scenario: A theme that is not in use
    Fails with: The "Dark theme" appearance is not in use
    Given I am a logged in user with the "user" user
    When I open the "Appearance and accessibility" section of the personal settings
    Then the "Dark theme" appearance should be in use

  Scenario: An account the list does not have
    Fails with: The account list does not show "nobody".
    Given I am a logged in user with the "administrator" user
    When I go to the accounts page
    Then the account list should show "nobody"

  Scenario: A group the account is not in
    Fails with: The account "editor" is not in the group "admin".
    Given I am a logged in user with the "administrator" user
    When I go to the accounts page
    Then the account "editor" should be in the group "admin"
