@settings
Feature: The personal settings
  As a person with an account
  I want to keep my profile, my password and the look of the site my own
  So that the site is mine to use

  Scenario: A field of the profile is saved
    Given I am a logged in user with the "user" user
    When I go to the personal settings
    And I set my "Headline" to "Planning lead"
    Then my "Headline" should be "Planning lead"

  Scenario: A wrong current password is refused
    Given I am a logged in user with the "user" user
    When I open the "Security" section of the personal settings
    And I change my password with the wrong current password "Wrong-password-1"
    Then a message "Wrong password" should pop up

  Scenario: A new password is the one that logs in
    Given I am a logged in user with the "user" user
    When I open the "Security" section of the personal settings
    And I change my password to "Webship-Changed-2026"
    And I log out
    And I log in as "user" with the login form
    Then I should be logged in as "user"

  Scenario: The dark theme
    Given I am a logged in user with the "user" user
    When I open the "Appearance and accessibility" section of the personal settings
    And I choose the "Dark theme" appearance
    Then the "Dark theme" appearance should be in use
