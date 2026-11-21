@must-fail
Feature: Assertions that must fail: the session, the header and the dashboard
  Each scenario asserts something that is not true on the test site. Its last step must fail, with the message its
  description announces and a hint; the steps before it pass. tests/check-must-fail.js runs them.

  @js-off
  Scenario: A refusal in words the login page does not say
    Fails with: The login page does not say "Account disabled".
    Given I am on the login page
    When I log in with the username "user" and the password "Wrong-password-1"
    Then the login should be refused with "Account disabled"

  Scenario: The browser logged in as another account
    Fails with: The browser is logged in as user, not as editor ("editor").
    Given I am a logged in user with the "user" user
    Then I should be logged in as "editor"

  Scenario: A visitor is not logged in
    Fails with: The browser is not logged in, not as user ("user")
    Given I am not logged in
    Then I should be logged in as "user"

  Scenario: An app the apps menu does not list
    Fails with: The apps menu does not list "Mail".
    Given I am a logged in user with the "user" user
    Then the apps menu should list "Mail"

  Scenario: An entry the user menu of an account does not offer
    Fails with: The user menu does not offer "Accounts".
    Given I am a logged in user with the "user" user
    Then the user menu should offer "Accounts"

  Scenario: The dashboard greets another name
    Fails with: The dashboard does not greet "Editor"
    Given I am a logged in user with the "user" user
    When I go to the dashboard
    Then the dashboard should greet "Editor"

  @js-off
  Scenario: Another error page
    Fails with: The site does not show the error page "Page not found": it shows "Access forbidden".
    Given I am a logged in user with the "user" user
    When I go to "/settings/admin"
    Then I should see the error page "Page not found"
