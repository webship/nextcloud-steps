@navigation
Feature: The header of the apps
  As a person working on the file server
  I want the apps menu, the user menu and my status in the header
  So that I move between the apps and see what my account may do

  Scenario: The apps menu opens an app
    Given I am a logged in user with the "user" user
    Then the apps menu should list "Files"
    And the apps menu should list "Activity"
    When I open the "Files" app
    Then I should be in the "Files" app

  Scenario: The user menu of an account
    Given I am a logged in user with the "user" user
    Then the user menu should offer "Settings"
    And the user menu should offer "Log out"
    And the user menu should not offer "Accounts"
    When I choose "Settings" in the user menu
    Then I should see "Profile & contact"

  Scenario: The user menu of an administrator
    Given I am a logged in user with the "administrator" user
    Then the user menu should offer "Accounts"
    And the user menu should offer "Administration settings"
    When I choose "Accounts" in the user menu
    Then the account list should show "editor"

  Scenario: The online status
    Given I am a logged in user with the "user" user
    When I set my status to "Away"
    Then my status should be "Away"

  # The browser logs the refused request (403).
  @js-off
  Scenario: An account is refused the administration settings
    Given I am a logged in user with the "user" user
    When I go to "/settings/admin"
    Then I should see the error page "Access forbidden"

  # The browser logs the request the site does not answer (404).
  @js-off
  Scenario: An address the site does not have
    Given I am a logged in user with the "user" user
    When I go to "/apps/no-such-app/"
    Then I should see the error page "Page not found"
