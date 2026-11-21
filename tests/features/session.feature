@session
Feature: Logging in and out
  As a person with an account on the file server
  I want to log in, be refused with a wrong password, and log out
  So that only the people with an account reach their files

  @critical
  Scenario: A visitor is sent to the login page
    Given I am not logged in
    Then I should be on the login page
    And I should not be logged in

  Scenario Outline: The <account> account logs in with the login form
    Given I am not logged in
    When I log in as "<account>" with the login form
    Then I should be logged in as "<account>"
    And I should be in the "Dashboard" app

    Examples:
      | account       |
      | administrator |
      | editor        |
      | user          |

  Scenario: A wrong password is refused
    Given I am on the login page
    When I log in with the username "user" and the password "Wrong-password-1"
    Then the login should be refused with "Wrong login or password."
    And I should not be logged in

  Scenario: An unknown account is refused with the same words
    Given I am on the login page
    When I log in with the username "nobody" and the password "Wrong-password-1"
    Then the login should be refused with "Wrong login or password."
    And I should be on the login page

  Scenario: A later scenario takes the session over
    Given I am a logged in user with the "user" user
    When I go to the files
    Then I should be logged in as "user"
    And I should be in the "Files" app

  Scenario: The accounts change within a scenario
    Given I am a logged in user with the "user" user
    Then I should be logged in as "user"
    Given I am a logged in user with the "editor" user
    Then I should be logged in as "editor"

  Scenario: Logging out ends the session
    Given I am a logged in user with the "user" user
    When I log out
    Then I should be on the login page
    And I should not be logged in
