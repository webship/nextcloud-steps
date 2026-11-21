@dashboard
Feature: The dashboard
  As a person who logs in
  I want a dashboard that greets me and shows the widgets I chose
  So that I see what matters first

  @critical
  Scenario: The dashboard greets the account
    Given I am a logged in user with the "user" user
    When I go to the dashboard
    Then the dashboard should greet "User"
    And the dashboard should show the "Recommended files" widget

  Scenario: A widget is added and lists a favorite
    Given "user" has the file "meeting-notes.md"
    And I am a logged in user with the "user" user
    When I go to the files
    And I add "meeting-notes.md" to the favorites
    And I go to the dashboard
    And I add the "Favorite files" widget to the dashboard
    Then the dashboard should show the "Favorite files" widget
    And the "Favorite files" widget should list "meeting-notes.md"

  Scenario: A widget is removed
    Given I am a logged in user with the "user" user
    When I go to the dashboard
    And I remove the "Recommended files" widget from the dashboard
    Then the dashboard should not show the "Recommended files" widget
